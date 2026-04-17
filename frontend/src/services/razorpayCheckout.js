import { NativeModules, Platform } from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';

export async function openRazorpayCheckout(options) {
  if (Platform.OS === 'web') {
    throw new Error('Native Razorpay checkout is available only on Android or iOS builds.');
  }

  const nativeRazorpayModule = NativeModules?.RNRazorpayCheckout;

  if (!nativeRazorpayModule || typeof nativeRazorpayModule.open !== 'function') {
    throw new Error(
      'Razorpay checkout is not available in this app build. Use a native Android/iOS build with the Razorpay module linked.'
    );
  }

  try {
    return await RazorpayCheckout.open(options);
  } catch (error) {
    if (error?.description) {
      throw new Error(error.description);
    }

    throw error;
  }
}
