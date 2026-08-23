import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, type User, type PhotographerStatus } from './api';

type MeResponse = {
  user: User | null;
  photographer: { id: string; slug: string; status: PhotographerStatus } | null;
};

type AuthContextValue = {
  user: User | null;
  photographer: MeResponse['photographer'];
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<MeResponse> => {
      try {
        return await api.get<MeResponse>('/api/auth/me');
      } catch {
        return { user: null, photographer: null };
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      api.post<{ user: User }>('/api/auth/login', vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: () => qc.setQueryData(['me'], { user: null, photographer: null }),
  });

  const value: AuthContextValue = {
    user: data?.user ?? null,
    photographer: data?.photographer ?? null,
    loading: isLoading,
    login: async (email, password) => {
      const res = await loginMutation.mutateAsync({ email, password });
      return res.user;
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
    refresh: () => qc.invalidateQueries({ queryKey: ['me'] }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
