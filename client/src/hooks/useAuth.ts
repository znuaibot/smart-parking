import { useAuthStore } from '@/store/authStore';

export const useAuth = () => {
  const { user, accessToken, isAuthenticated, setUser, logout } = useAuthStore();

  return {
    user,
    accessToken,
    isAuthenticated,
    setUser,
    logout,
  };
};
