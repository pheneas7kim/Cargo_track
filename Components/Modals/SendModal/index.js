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

const SEND_TO_USERS_LIST = [
    {
        id: 1,
        label: 'Mom',
        value: 'MOM',
    },
    {
        id: 2,
        label: 'Padosi',
        value: 'PADOSI',
    },
    {
        id: 3,
        label: 'Dost',
        value: 'DOST',
    },
    {
        id: 4,
        label: 'Amitabh Bachchan',
        value: 'AMITABH_BACHCHAN',
    }
]

const SendMoneyModal = ({ modalData }) => {

    const { handleSubmitFn = () => null } = modalData;
    const [amount, setAmount] = useState('');
    const [amountHasError, setAmountHasError] = useState(false);
    const [amountErrorText, setAmountErrorText] = useState(null);

    const [sendToObj, setSendToObj] = useState(null);
    const [SendToHasError, setSendToHasError] = useState(false);
    const [sendToErrorText, setSendToErrorText] = useState(null);



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

    function resetSendToStates() {
        setSendToHasError(false);
        setSendToErrorText(null);
    }

    function handleSendToClick(selectedOption) {
        setSendToObj(selectedOption);

        if (SendToHasError) resetSendToStates();
    }

    function onSubmitClick() {
        let hasAnyError = false;

        if (amount === '' || amount === null) {
            hasAnyError = true;
            handleNameField('');
        }
        if (sendToObj === null) {
            hasAnyError = true;
            setSendToHasError(true);
            setSendToErrorText('This field is required.');
        }

        if (!hasAnyError) handleSubmitFn({ amount, sendToObj });
    }


    return (
        <KeyboardAvoidingView className='h-full relative'>
            <View className='mb-4'>
                <Text className='font-bold mb-2 text-black' >Amount</Text>
                <TextInput
                    onChangeText={handleNameField}
                    value={amount}
                    placeholder='Enter Amount'
                    placeholderTextColor={'#687076'}
                    keyboardType='numeric'
                    inputMode='numeric'
                    maxLength={10}
                    className={`rounded-md border text-black ${amountHasError && amountErrorText ? 'border-red-500' : 'border-neutral-300'}`}
                />
                {amountHasError && <Text className='text-sm text-red-500' >{amountErrorText}</Text>}
            </View>
            <View className='mb-4'>
                <Text className='font-bold mb-2 text-black' >Send To</Text>
                <DropDown
                    options={SEND_TO_USERS_LIST}
                    hasError={SendToHasError}
                    errorText={sendToErrorText}
                    value={sendToObj}
                    onSelectOption={handleSendToClick}
                />
            </View>
            <View className='absolute bottom-0 flex flex items-center w-full'>
                <View className='w-3/5 pb-4' >
                    <Button
                        onPress={onSubmitClick}
                        title='Send Money'
                        disabled={amountHasError || SendToHasError}
                    />
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

export default SendMoneyModal;