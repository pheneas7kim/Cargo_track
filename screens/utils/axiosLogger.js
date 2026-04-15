import axios from 'axios';

export const setupAxiosLogging = () => {
  // REQUEST LOG
  axios.interceptors.request.use(
    async (config) => {
      console.log('\n🚀 REQUEST');
      console.log('➡️ URL:', config.url);
      console.log('➡️ METHOD:', config.method?.toUpperCase());
      console.log('➡️ HEADERS:', config.headers);
      console.log('➡️ PARAMS:', config.params);
      console.log('➡️ DATA:', config.data);

      return config;
    },
    (error) => {
      console.log('\n❌ REQUEST ERROR:', error);
      return Promise.reject(error);
    }
  );

  // RESPONSE LOG
  axios.interceptors.response.use(
    (response) => {
      console.log('\n✅ RESPONSE');
      console.log('⬅️ URL:', response.config.url);
      console.log('⬅️ STATUS:', response.status);
      console.log('⬅️ DATA:', response.data);

      return response;
    },
    (error) => {
      console.log('\n🔥 RESPONSE ERROR');

      if (error.response) {
        console.log('⬅️ URL:', error.config?.url);
        console.log('⬅️ STATUS:', error.response.status);
        console.log('⬅️ DATA:', error.response.data);
      } else {
        console.log('⬅️ ERROR:', error.message);
      }

      return Promise.reject(error);
    }
  );
};