import { QueryClient } from 'react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,      // 30s 内数据视为新鲜
      cacheTime: 5 * 60 * 1000,  // 5min 缓存
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
