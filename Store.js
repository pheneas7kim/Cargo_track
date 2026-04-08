import { configureStore } from '@reduxjs/toolkit';
import accountSlice from './FeatureSlice/accountSlice';
import prePaymentSlice from './FeatureSlice/prePaymentSlice';
import cardsSlice from './FeatureSlice/cardsSlice';

const store = configureStore({
  reducer: {
    account: accountSlice,
    prePayment: prePaymentSlice,
    allCards: cardsSlice,
  }
});

export default store;