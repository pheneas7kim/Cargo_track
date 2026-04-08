import React, { useRef } from 'react';

import {
    ActivityIndicator,
    Button,
    Modal,
    SafeAreaView,
    ScrollView,
    StatusBar,
    Text,
    TouchableHighlight,
    TouchableNativeFeedback,
    TouchableOpacity,
    useColorScheme,
    View,
    Animated,
    PanResponder
} from 'react-native';

import ArrowIcon from '../../Assets/svgs/BackArrow.svg';

function BottomModal({ visible = true, onClose = () => null, children = null, headingLabelText = null, showBackBtn = false,
    handleBackBtn = () => null, containerStyle = null }) {

    return (
        <Modal
            animationType="slide"
            visible={visible}
            transparent={true}
        >
            <View className='h-full bg-neutral-300/70 flex relative' >
                <Animated.View className={`absolute bottom-0 bg-white w-full rounded-t-2xl p-4 h-1/2 ${containerStyle}`} >
                    <View className='flex flex-row justify-between items-center' >
                        {!!headingLabelText && (<Text className='text-black font-bold text-xl ' >{headingLabelText}</Text>)}
                        {showBackBtn && (<TouchableOpacity onPress={handleBackBtn} >
                            <ArrowIcon height={25} width={25} />
                        </TouchableOpacity>)}
                        {!headingLabelText && !showBackBtn && <View></View>}

                        <TouchableOpacity onPress={onClose} >
                            <Text className='text-2xl text-slate-800 px-2 rounded-2xl relative bg-neutral-300 rotate-45' >+</Text>
                        </TouchableOpacity>

                    </View>

                    <View className='py-2' >
                        {children}
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

export default BottomModal;