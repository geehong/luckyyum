import axios from 'axios';

// 실제 배포 시 클라우드 서버 URL로 변경해야 함.
const BASE_URL = 'http://luckyyum.firemarkets.net'; // Nginx Proxy Manager를 통해 라우팅

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const syncRanking = async (token: string, data: { pet_nickname: string; pet_tier: number; pet_mbti: string; care_score: number }) => {
  try {
    const response = await apiClient.post('/rankings/sync', data, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to sync ranking:', error);
    throw error;
  }
};

export const fetchRankings = async () => {
  try {
    const response = await apiClient.get('/rankings');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch rankings:', error);
    throw error;
  }
};
