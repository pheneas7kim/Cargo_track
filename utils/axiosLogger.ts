import axios from 'axios';

export const setupAxiosLogging = () => {
  axios.interceptors.request.use(req => {
    console.log('REQUEST ====================');
    console.log('URL:', req.url);
    console.log('METHOD:', req.method);
    console.log('DATA:', req.data);
    console.log('HEADERS:', req.headers);
    return req;
  });

  axios.interceptors.response.use(
    res => {
      console.log('RESPONSE ===================');
      console.log('URL:', res.config.url);
      console.log('STATUS:', res.status);
      console.log('DATA:', res.data);
      return res;
    },
    err => {
      console.log('ERROR RESPONSE =============');
      console.log('URL:', err.config?.url);
      console.log('STATUS:', err.response?.status);
      console.log('DATA:', err.response?.data);
      console.log('MESSAGE:', err.message);
      return Promise.reject(err);
    }
  );
};