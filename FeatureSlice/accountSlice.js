import { createSlice } from '@reduxjs/toolkit';


const accountSlice = createSlice({
    name: 'account',
    initialState: {
        availableBalance: 1234567.50,
        currencySymbol: '₹',
        plannedPayments: [
            {
                paymentId: 1234,
                categoryEmun: 'INTERNET',
                labelText: 'Internet',
                amount: 40,
                currencySymbol: '₹',
                triggerDate: '3', // show the day of the month to trigger this  
            }
        ],
        caraosalContent: [{
            contentId: 2345,
            headingText: 'Set your Budget',
            subHeadingText: 'Take control of your finance'
        }]
    },
    reducers: {
        incrementMoney: (state, action) => {
            const value = action?.payload;
            if(value && Number(value) > 0) state.availableBalance += Number(value);
        },
        decrementMoney: (state, action) => {
            const value = action?.payload;
            if(value && Number(value) > 0) state.availableBalance -= Number(value);
        },     
    }
});


export const { incrementMoney, decrementMoney } = accountSlice.actions;
export default accountSlice.reducer;