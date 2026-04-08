import { createSlice } from '@reduxjs/toolkit'

const prePaymentSlice = createSlice({
    name: 'prePayment',
    initialState: [
        {
            paymentId: 1234,
            amount: 40,
            name: 'Internet',
            categoryObj: { label: 'Internet', value: 'INTERNET', id: 1 },
            triggerDate: '3', // show the day of the month to trigger this  
        },
        {
            paymentId: 2,
            name: 'SIP',
            amount: 2999,
            categoryObj: { label: 'Investment', value: 'INVESTMENT', id: 3 },
            triggerDate: '3',
        },
        {
            paymentId: 3,
            name: 'Electricity',
            amount: 999,
            categoryObj: { label: 'Utilities', value: 'UTILITIES', id: 4 },
            triggerDate: '3',
        },
        {
            paymentId: 4,
            name: 'Clubs',
            amount: 349,
            categoryObj: { label: 'Entertainment', value: 'ENTERTAINMENT', id: 2 },
            triggerDate: '3',
        },
        {
            paymentId: 12345,
            amount: 39,
            name: 'Internet fast',
            categoryObj: { label: 'Internet', value: 'INTERNET', id: 1 },
            triggerDate: '3', // show the day of the month to trigger this  
        },
        {
            paymentId: 21,
            name: 'SIP - Gold',
            amount: 3999,
            categoryObj: { label: 'Investment', value: 'INVESTMENT', id: 3 },
            triggerDate: '3',
        },
        {
            paymentId: 31,
            name: 'Electricity - Office',
            amount: 1999,
            categoryObj: { label: 'Utilities', value: 'UTILITIES', id: 4 },
            triggerDate: '3',
        },
        {
            paymentId: 41,
            name: 'Clubs - Food',
            amount: 750,
            categoryObj: { label: 'Entertainment', value: 'ENTERTAINMENT', id: 2 },
            triggerDate: '3',
        }
    ],
    reducers: {
        addNewPrePayment: (state, action) => {
            const paymentObj = action?.payload;

            if (paymentObj) {
                const newId = state.length > 0 ? state[state.length - 1] + 1 : 100;
                state.push({ ...paymentObj, paymentId: newId });
            }

        },
        removePrePayment: (state, action) => {
            const idToBeRemoved = action?.payload;

            if (Number(idToBeRemoved) >= 0) state.filter((id) => id != idToBeRemoved);

        },
        modifyPrePayment: (state, action) => {
            const paymentObj = action?.payload;

            if (paymentObj) {
                const valueToBeUpdatedIndex = state.findIndex(({ paymentId }) => paymentId === paymentObj.paymentId);
                if (valueToBeUpdatedIndex > -1) {
                    state[valueToBeUpdatedIndex] = { ...paymentObj, paymentId: paymentObj.paymentId }; // guardrail to never accidently edit paymentId
                }
            }
        },
    }
});


export const { addNewPrePayment, removePrePayment, modifyPrePayment } = prePaymentSlice.actions;
export default prePaymentSlice.reducer;