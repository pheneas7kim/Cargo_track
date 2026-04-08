import React, { useState } from 'react';

import {
    Button,
    KeyboardAvoidingView,
    Text,
    TextInput,
    View,
} from 'react-native';

import { checkForNumberWithDecialAllowed, getNumberWithDecimal } from '../../../Utils/numericUtils';
import DropDown from '../../DropDown';

const INVEST_TO_USERS_LIST = [
    {
        id: 1,
        label: 'Stocks',
        value: 'STOCKS',
    },
    {
        id: 2,
        label: 'Crypto',
        value: 'CRYPTO',
    },
    {
        id: 3,
        label: 'Gold',
        value: 'GOLD',
    },
    {
        id: 4,
        label: 'Real Estate',
        value: 'REAL_ESTATE',
    }
]

const InvestMoneyModal = ({ modalData }) => {

    const { handleSubmitFn = () => null } = modalData;
    const [amount, setAmount] = useState('');
    const [amountHasError, setAmountHasError] = useState(false);
    const [amountErrorText, setAmountErrorText] = useState(null);

    const [investToObj, setInvestToObj] = useState(null);
    const [investToHasError, setInvestToHasError] = useState(false);
    const [investToErrorText, setInvestToErrorText] = useState(null);



    function setAmountErrorStates(errorMsg = null) {
        setAmountHasError(true);
        setAmountErrorText(errorMsg);
    }

    function resetAmountErrorStates() {
        setAmountHasError(false);
        setAmountErrorText(null);
    }

    function handleNameField(value) {
        setAmount(value);

        if (checkForNumberWithDecialAllowed(value)) {
            if (value < 0) {
                setAmountErrorStates('Invalid input, Please enter postive number only')
            } else {
                const onlyPositiveDecimalNum = getNumberWithDecimal(value);
                setAmount(onlyPositiveDecimalNum);

                if (amountHasError) resetAmountErrorStates();
            }
        } else if (value < 0) {
            setAmountErrorStates('Invalid input, Please enter postive number only')
        } else if ((value + '').length === 0) {
            setAmountErrorStates('Please enter an amount')
        } else {
            setAmountErrorStates(`Invalid input entered`)
        }
    }

    function resetInvestToStates() {
        setInvestToHasError(false);
        setInvestToErrorText(null);
    }

    function handleInvestToClick(selectedOption) {
        setInvestToObj(selectedOption);

        if (investToHasError) resetInvestToStates();
    }

    function onSubmitClick() {
        let hasAnyError = false;

        if (amount === '' || amount === null) {
            hasAnyError = true;
            handleNameField('');
        }
        if (investToObj === null) {
            hasAnyError = true;
            setInvestToHasError(true);
            setInvestToErrorText('This field is required.');
        }

        if (!hasAnyError) handleSubmitFn({ amount, investToObj });
    }


    return (
        <KeyboardAvoidingView className='h-full relative'>
            <View className='mb-4'>
                <Text className='font-bold mb-2' >Amount</Text>
                <TextInput
                    onChangeText={handleNameField}
                    value={amount}
                    placeholder='Enter Amount'
                    placeholderTextColor={'#687076'}
                    keyboardType='numeric'
                    inputMode='numeric'
                    maxLength={10}
                    defaultValue={''}
                    className={`rounded-md border ${amountHasError && amountErrorText ? 'border-red-500' : 'border-neutral-300'}`}
                />
                {amountHasError && <Text className='text-sm text-red-500' >{amountErrorText}</Text>}
            </View>
            <View className='mb-4'>
                <Text className='font-bold mb-2' >Invest To</Text>
                <DropDown
                    options={INVEST_TO_USERS_LIST}
                    hasError={investToHasError}
                    errorText={investToErrorText}
                    value={investToObj}
                    onSelectOption={handleInvestToClick}
                />
            </View>
            <View className='absolute bottom-0 flex flex items-center w-full'>
                <View className='w-3/5 pb-4' >
                    <Button
                        onPress={onSubmitClick}
                        title='Invest Money'
                        disabled={amountHasError || investToHasError}
                    />
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

export default InvestMoneyModal;