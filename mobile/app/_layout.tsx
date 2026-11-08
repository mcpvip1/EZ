import { Tabs } from 'expo-router';
import { DataProvider } from '../src/store';

export default function RootLayout() {
  return (
    <DataProvider>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: '#0f172a' },
          headerTintColor: '#fff',
          tabBarActiveTintColor: '#0f172a',
          tabBarLabelStyle: { fontSize: 13, fontWeight: '700' },
          tabBarStyle: { paddingBottom: 4, height: 58 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'EASY 2D — Board' }} />
        <Tabs.Screen name="lucky" options={{ title: 'Lucky No' }} />
        <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
        <Tabs.Screen name="people" options={{ title: 'People' }} />
        <Tabs.Screen name="more" options={{ title: 'More' }} />
      </Tabs>
    </DataProvider>
  );
}
