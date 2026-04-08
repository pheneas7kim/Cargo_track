import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';

import {
    KeyboardAvoidingView,
    Text,
    Pressable,
    View,
    ScrollView,
} from 'react-native';

import { ICONS_ENUM } from '../../../Utils/ImageUtils';

const ViewAllPaymentsModal = ({ modalData }) => {

    const { handleSubmitFn = () => null, currencySymbol, handlePaymentClick } = modalData;

    const prePayments = useSelector(state => state.prePayment)


    return (
        <ScrollView className='h-full relative'>
            <View className='py-4' ></View>
            {
                prePayments.map((prePaymentObj) => {
                    const CategoryIcon = ICONS_ENUM[prePaymentObj?.categoryObj?.value] || <></>

                    return (<Pressable
                        key={prePaymentObj.paymentId + ''}
                        onPress={() => handlePaymentClick(prePaymentObj, 'VIEW_ALL_PAYMENTS')}
                    >
                        <View className='flex flex-row bg-white items-center px-2 py-4 mb-4 border border-neutral-200 rounded-xl' >
                            <View className='rounded-3xl mr-2'>
                                <CategoryIcon height={30} width={30} />
                            </View>
                            <View className='flex-1 flex flex-row justify-between items-center'>
                                <Text className='text-neutral-600 text-lg' >{prePaymentObj.name}</Text>
                                <Text className='text-neutral-800 font-bold text-lg' >{`${currencySymbol}${prePaymentObj.amount}`}</Text>
                            </View>
                        </View>
                    </Pressable>)
                })
            }
            <View className='py-4' ></View>
        </ScrollView>
    );
}

export default ViewAllPaymentsModal;