import { createSlice } from '@reduxjs/toolkit';


const cardsSlice = createSlice({
    name: 'allCards',
    initialState: {
        availableBalance: 1234567.50, // net avaiable balance across all the cards
        currencySymbol: '₹',
        cards: [
            {
                cardId: 199165,
                cardNo: 1122334455667788,
                cardNoInText: "1122 3344 5566 7788",
                cardNetwork: 'Visa',
                cardNetworkEnum: 'VISA',
                nameOnCard: 'Test 12',
                cardExpiry: 1720872264, // epooch value
                cardExpiryInText: '09/2024',
                cardColor: 'bg-teal-500',
                totalIncomeAmount: 10000,
                totalOutgoneAmount: 7000,
                transactions: [
                    {
                        id: 101,
                        name: "Airbnb - hostel",
                        category: 'Housing',
                        categoryEnum: 'HOUSING',
                        typeEnum: 'DEBIT',
                        amount: 4999,
                        date: 1720872264,
                        dateString: '24 Feb, 2024',
                    },
                    {
                        id: 102,
                        name: "Uber - Ride",
                        category: 'Transportation',
                        categoryEnum: 'TRANSPORTATION',
                        typeEnum: 'DEBIT',
                        amount: 357,
                        date: 1720872264,
                        dateString: '23 Feb, 2024',
                    },
                    {
                        id: 10221,
                        name: "Mutual Fund Interest",
                        category: 'Investment',
                        categoryEnum: 'INVESTMENT',
                        typeEnum: 'CREDIT',
                        amount: 999,
                        date: 1720872264,
                        dateString: '23 Feb, 2024',
                    },
                    {
                        id: 10111,
                        name: "Food Delivery",
                        category: 'Food',
                        categoryEnum: 'FOOD',
                        typeEnum: 'DEBIT',
                        amount: 475,
                        date: 1720872264,
                        dateString: '24 Feb, 2024',
                    },
                    {
                        id: 10212,
                        name: "Uber - Ride",
                        category: 'Transportation',
                        categoryEnum: 'TRANSPORTATION',
                        typeEnum: 'DEBIT',
                        amount: 357,
                        date: 1720872264,
                        dateString: '23 Feb, 2024',
                    },
                    {
                        id: 10122,
                        name: "Airbnb - hostel",
                        category: 'Housing',
                        categoryEnum: 'HOUSING',
                        typeEnum: 'DEBIT',
                        amount: 4999,
                        date: 1720872264,
                        dateString: '24 Feb, 2024',
                    },
                    {
                        id: 10223,
                        name: "Refund from Govt",
                        category: 'Refund',
                        categoryEnum: 'INVESTMENT',
                        typeEnum: 'CREDIT',
                        amount: 35700,
                        date: 1720872264,
                        dateString: '23 Feb, 2024',
                    },
                    {
                        id: 10133,
                        name: "Airbnb - hostel",
                        category: 'Housing',
                        categoryEnum: 'HOUSING',
                        typeEnum: 'DEBIT',
                        amount: 4999,
                        date: 1720872264,
                        dateString: '24 Feb, 2024',
                    },
                    {
                        id: 10234,
                        name: "Uber - Ride",
                        category: 'Transportation',
                        categoryEnum: 'TRANSPORTATION',
                        typeEnum: 'DEBIT',
                        amount: 357,
                        date: 1720872264,
                        dateString: '23 Feb, 2024',
                    }
                ]
            },
            {
                cardId: 2001,
                cardNo: 1122334455667700,
                cardNoInText: "1122 3344 5566 7700",
                cardNetwork: 'Rupay',
                cardNetworkEnum: 'RUPAY',
                nameOnCard: 'Test 22',
                cardExpiry: 1720872264, // epooch value
                cardExpiryInText: '03/2026',
                cardColor: 'bg-sky-500',
                totalIncomeAmount: 34000,
                totalOutgoneAmount: 21000,
                transactions: [
                    {
                        id: 1011,
                        name: "Airbnb - hostel",
                        category: 'Housing',
                        categoryEnum: 'HOUSING',
                        typeEnum: 'DEBIT',
                        amount: 4999,
                        date: 1720872264,
                        dateString: '24 Feb, 2024',
                    },
                    {
                        id: 1021,
                        name: "Pay from friend",
                        category: 'GPay',
                        categoryEnum: 'INVESTMENT',
                        typeEnum: 'CREDIT',
                        amount: 357,
                        date: 1720872264,
                        dateString: '23 Feb, 2024',
                    },
                    {
                        id: 1022,
                        name: "Uber Refund",
                        category: 'Refund',
                        categoryEnum: 'TRANSPORTATION',
                        typeEnum: 'CREDIT',
                        amount: 357,
                        date: 1720872264,
                        dateString: '23 Feb, 2024',
                    },
                    {
                        id: 102254,
                        name: "Uber - Ride",
                        category: 'Transportation',
                        categoryEnum: 'TRANSPORTATION',
                        typeEnum: 'DEBIT',
                        amount: 357,
                        date: 1720872264,
                        dateString: '23 Feb, 2024',
                    }
                ]
            }
        ]
    },
    reducers: {
        addNewCard: (state, action) => {
            // const value = action?.payload;
            // if (value && Number(value) > 0) state.availableBalance += Number(value);

        },
        removeCard: (state, action) => {
            // const value = action?.payload;
            // if (value && Number(value) > 0) state.availableBalance += Number(value);

        },
        addNewTransaction: (state, action) => {
            // const value = action?.payload;
            // if (value && Number(value) > 0) state.availableBalance += Number(value);
        },
        removeTransaction: (state, action) => {
            // const value = action?.payload;
            // if (value && Number(value) > 0) state.availableBalance += Number(value);
        }
    }
});


export const { addNewCard, removeCard, addNewTransaction, removeTransaction, getAllTransactionsList } = cardsSlice.actions;
export default cardsSlice.reducer;