import React, { useState, useEffect } from 'react';

import {
    Button,
    KeyboardAvoidingView,
    Text,
    TextInput,
    TouchableHighlight,
    View,
} from 'react-native';

import { checkForNumberWithDecialAllowed, getNumberWithDecimal } from '../../../Utils/numericUtils';
import DropDown from '../../DropDown';

import EditIcon from '../../../Assets/svgs/EditIcon.svg';

const PRE_PAYMENT_CATEGORY_LIST = [
    {
        id: 1,
        label: 'Internet',
        value: 'INTERNET',
    },
    {
        id: 2,
        label: 'Entertainment',
        value: 'ENTERTAINMENT',
    },
    {
        id: 3,
        label: 'Investment',
        value: 'INVESTMENT',
    },
    {
        id: 4,
        label: 'Utilities',
        value: 'UTILITIES',
    }
]

const PrePaymentModal = ({ modalData }) => {

    const { handleSubmitFn = () => null, allowToModify = true, data = {} } = modalData;
    const { name = '', amount = '', categoryObj = null } = data;

    const [isEditable, setIsEditable] = useState(true);

    const [nameField, setNameField] = useState('');
    const [nameFieldHasError, setNameFieldHasError] = useState(false);
    const [nameFieldErrorText, setNameFieldErrorText] = useState(null);

    const [categoryField, setCategoryField] = useState(null);
    const [categoryFieldHasError, setCategoryFieldHasError] = useState(false);
    const [categoryFieldErrorText, setCategoryFieldErrorText] = useState(null);

    const [amountField, setAmountField] = useState('');
    const [amountFieldHasError, setAmountFieldHasError] = useState(false);
    const [amountFieldErrorText, setAmountFieldErrorText] = useState(null);

    useEffect(() => {
        // Set Defaults state from props

        if (!!name && (!!amount || amount === 0) && !!categoryObj?.value) setIsEditable(false);
        else setIsEditable(allowToModify);

        if (!!name) setNameField(name);
        if (!!amount || amount === 0) setAmountField(amount);
        if (!!categoryObj?.value) setCategoryField(categoryObj);


    }, []);


    function setAmountErrorStates(errorMsg = null) {
        setAmountFieldHasError(true);
        setAmountFieldErrorText(errorMsg);
    }

    function resetAmountErrorStates() {
        setAmountFieldHasError(false);
        setAmountFieldErrorText(null);
    }

    function handleAmountField(value) {
        setAmountField(value);

        if (checkForNumberWithDecialAllowed(value)) {
            if (value < 0) {
                setAmountErrorStates('Invalid input, Please enter postive number only')
            } else {
                const onlyPositiveDecimalNum = getNumberWithDecimal(value);
                setAmountField(onlyPositiveDecimalNum);

                if (amountFieldHasError) resetAmountErrorStates();
            }
        } else if (value < 0) {
            setAmountErrorStates('Invalid input, Please enter postive number only')
        } else if ((value + '').length === 0) {
            setAmountErrorStates('Please enter an amount')
        } else {
            setAmountErrorStates(`Invalid input entered`)
        }
    }

    function resetCategoryStates() {
        setCategoryFieldHasError(false);
        setCategoryFieldErrorText(null);
    }

    function handleCategoryClick(selectedOption) {
        setCategoryField(selectedOption);

        if (categoryFieldHasError) resetCategoryStates();
    }

    function resetNameErrorStates() {
        setNameFieldHasError(false);
        setNameFieldErrorText(null);
    }

    function handlePrePaymentName(value) {
        setNameField(value);

        if (nameFieldHasError) resetNameErrorStates();
    }

    function onSubmitClick() {
        let hasAnyError = false;

        if (nameField === '' || nameField === null) {
            hasAnyError = true;
            setNameFieldHasError(true);
            setNameFieldErrorText('This field is required.');
        }
        if (categoryField === null) {
            hasAnyError = true;
            setCategoryFieldHasError(true);
            setCategoryFieldErrorText('This field is required.');
        }
        if (amount === '' || amount === null) {
            hasAnyError = true;
            handleAmountField('');
        }
        if (!hasAnyError) handleSubmitFn({ ...data, amount: amountField, categoryObj: categoryField, name: nameField });
    }

    function toggleIsEditable() {
        setIsEditable(true);
    }


    return (
        <KeyboardAvoidingView className='h-full relative'>
            <View className='mb-4'>
                <Text className='font-bold mb-2 text-black' >Name</Text>
                <TextInput
                    onChangeText={handlePrePaymentName}
                    value={nameField}
                    placeholder='Enter pre payment name'
                    placeholderTextColor={isEditable && !nameField ? '#687076' : '#000'}
                    // keyboardType='numeric'
                    // inputMode='numeric'
                    disabled={!isEditable}
                    maxLength={20}
                    defaultValue={''}
                    className={`rounded-md border text-black ${!isEditable ? 'bg-neutral-200' : 'bg-white'} ${nameFieldHasError && nameFieldErrorText ? 'border-red-500' : 'border-neutral-300'}`}
                />
                {nameFieldHasError && <Text className='text-sm text-red-500' >{nameFieldHasError}</Text>}
            </View>
            <View className='mb-4'>
                <Text className='font-bold mb-2 text-black' >Category</Text>
                <DropDown
                    options={PRE_PAYMENT_CATEGORY_LIST}
                    hasError={categoryFieldHasError}
                    errorText={categoryFieldErrorText}
                    value={categoryField}
                    disabled={!isEditable}
                    onSelectOption={handleCategoryClick}
                />
            </View>
            <View className='mb-4'>
                <Text className='font-bold mb-2 text-black' >Amount</Text>
                <TextInput
                    onChangeText={handleAmountField}
                    value={amountField}
                    placeholder='Enter amount'
                    placeholderTextColor={isEditable && !amountField ? '#687076' : '#000'}
                    keyboardType='numeric'
                    inputMode='numeric'
                    maxLength={10}
                    defaultValue={amountField.toString() || '0'}
                    editable={isEditable}
                    className={`rounded-md border text-black ${!isEditable ? 'bg-neutral-200' : 'bg-white'} ${amountFieldHasError && amountFieldErrorText ? 'border-red-500' : 'border-neutral-300'}`}
                />
                {amountFieldHasError && <Text className='text-sm text-red-500' >{amountFieldErrorText}</Text>}
            </View>
            <View className='w-full absolute right-0 bottom-0 flex flex-row items-center justify-between'>
                <View></View>
                <View className='pb-4' >
                    <Button
                        onPress={onSubmitClick}
                        title='Modify / Save Pre Payment'
                        disabled={amountFieldHasError || categoryFieldHasError || nameFieldHasError || !isEditable}
                    />
                </View>
                {allowToModify && !isEditable ?
                    <View className='pb-4' >
                        <TouchableHighlight onPress={toggleIsEditable} >
                            <EditIcon height={30} width={30} />
                        </TouchableHighlight>
                    </View>
                    : <View></View>}
            </View>
        </KeyboardAvoidingView>
    );
}

export default PrePaymentModal;