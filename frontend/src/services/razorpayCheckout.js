import { Platform } from 'react-native';
import RazorpayCheckout from 'react-native-razorpay';

export async function openRazorpayCheckout(options) {
  if (Platform.OS === 'web') {
    throw new Error('Native Razorpay checkout is available only on Android or iOS builds.');
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
