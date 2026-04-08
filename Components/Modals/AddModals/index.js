import React, { useState } from 'react';

import {
    Button,
    KeyboardAvoidingView,
    Text,
    TextInput,
    View,
} from 'react-native';

import { checkForNumberWithDecialAllowed, getNumberWithDecimal } from '../../../Utils/numericUtils';

const AddMoneyModal = ({ modalData }) => {

    const { handleSubmitFn = () => null } = modalData;
    const [amount, setAmount] = useState('');
    const [amountHasError, setAmountHasError] = useState(false);
    const [amountErrorText, setAmountErrorText] = useState(null);

    function setErrorStates(errorMsg = null) {
        setAmountHasError(true);
        setAmountErrorText(errorMsg);
    }

    function resetErrorStates() {
        setAmountHasError(false);
        setAmountErrorText(null);
    }

    function handleNameField(value) {
        setAmount(value);

        if (checkForNumberWithDecialAllowed(value)) {
            if (value < 0) {
                setErrorStates('Invalid input, Please enter postive number only')
            } else {
                const onlyPositiveDecimalNum = getNumberWithDecimal(value);
                setAmount(onlyPositiveDecimalNum);

                if (amountHasError) resetErrorStates();
            }
        } else if (value < 0) {
            setErrorStates('Invalid input, Please enter postive number only')
        } else if ((value + '').length === 0) {
            setErrorStates('Please enter an amount')
        } else {
            setErrorStates(`Invalid input entered`)
        }
    }

    function onSubmitClick() {
        let hasAnyError = false;

        if (amount === '' || amount === null) {
            hasAnyError = true;
            handleNameField('');
        }

        if (!hasAnyError) handleSubmitFn(amount);
    }


    return (
        <KeyboardAvoidingView className='h-full relative'>
            <View className=''>
                <Text className='font-bold mb-2 text-black' >Amount</Text>
                <TextInput
                    onChangeText={handleNameField}
                    value={amount}
                    placeholder='Enter Amount'
                    placeholderTextColor={'#687076'}
                    keyboardType='numeric'
                    inputMode='numeric'
                    maxLength={10}
                    defaultValue={''}
                    className={`rounded-md border text-black ${amountHasError && amountErrorText ? 'border-red-400' : 'border-neutral-300'}`}
                />
                {amountHasError && <Text className='text-sm text-red-400' >{amountErrorText}</Text>}
            </View>
            <View className='absolute bottom-0 flex flex items-center w-full'>
                <View className='w-3/5 pb-4' >
                    <Button
                        onPress={onSubmitClick}
                        title='Add Money'
                        disabled={amountHasError}
                    />
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

export default AddMoneyModal;