import React, { useEffect, useState } from 'react';
import { Platform, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from './src/screens/WelcomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import PolicyScreen from './src/screens/PolicyScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import { colors } from './src/constants/colors';

const Stack = createNativeStackNavigator();

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;
    if (document.getElementById('gigwise-genz-theme')) return;

    const style = document.createElement('style');
    style.id = 'gigwise-genz-theme';
    style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: ${colors.bg};
  color: ${colors.textStrong};
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  animation: pageFadeIn 420ms ease both;
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
button, input, textarea { font: inherit; }
::selection { background: rgba(168, 85, 247, 0.35); }
@keyframes pageFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}`;

    document.head.appendChild(style);
  }, []);

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <Stack.Navigator initialRouteName="Welcome" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Login">
          {(props) => <LoginScreen {...props} setUser={setUser} />}
        </Stack.Screen>
        <Stack.Screen name="Home">
          {(props) => <HomeScreen {...props} user={user} setUser={setUser} />}
        </Stack.Screen>
        <Stack.Screen name="Policy">
          {(props) => <PolicyScreen {...props} user={user} />}
        </Stack.Screen>
        <Stack.Screen name="Dashboard">
          {(props) => <DashboardScreen {...props} user={user} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
