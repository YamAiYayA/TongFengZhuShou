import React, { useEffect, useRef } from 'react';
import { Text } from 'react-native';
import {
  NavigationContainer,
  NavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/state/AppContext';
import { HomeScreen } from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { RecordScreen } from './src/screens/RecordScreen';
import { ReminderScreen } from './src/screens/ReminderScreen';
import { MainTabParamList, RootStackParamList } from './src/navigation/types';
import { colors } from './src/theme/colors';
import * as waterApp from './src/services/waterAppService';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', color: colors.ink },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: '今日',
          tabBarLabel: '今日',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 16 }}>水</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: '设置',
          tabBarLabel: '设置',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 16 }}>设</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  useEffect(() => {
    const openFromNotification = (
      response: Notifications.NotificationResponse,
    ) => {
      const data = response.notification.request.content.data as {
        reminderJobId?: number;
        kind?: 'water' | 'first_cup';
      };
      void waterApp.onReminderNotificationDelivered(
        data?.reminderJobId ? Number(data.reminderJobId) : undefined,
      );
      navRef.current?.navigate('Reminder', {
        reminderJobId: data?.reminderJobId
          ? Number(data.reminderJobId)
          : undefined,
        kind: data?.kind ?? 'water',
      });
    };

    const onReceived = (notification: Notifications.Notification) => {
      const data = notification.request.content.data as {
        reminderJobId?: number;
      };
      // Delivered (including while ignored): mark fired and queue next repeat.
      void waterApp.onReminderNotificationDelivered(
        data?.reminderJobId ? Number(data.reminderJobId) : undefined,
      );
    };

    const responseSub = Notifications.addNotificationResponseReceivedListener(
      openFromNotification,
    );
    const receivedSub =
      Notifications.addNotificationReceivedListener(onReceived);

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openFromNotification(response);
    });

    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
  }, []);

  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: '700', color: colors.ink },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Record"
          component={RecordScreen}
          options={{ title: '记录喝水' }}
        />
        <Stack.Screen
          name="Reminder"
          component={ReminderScreen}
          options={{ title: '喝水提醒' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AppProvider>
    </SafeAreaProvider>
  );
}
