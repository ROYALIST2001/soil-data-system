import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text, View, ActivityIndicator, StyleSheet } from "react-native";

import SoilEntryScreen from "../screens/SoilEntryScreen";
import ResultScreen from "../screens/ResultScreen";
import RecommendationScreen from "../screens/RecommendationScreen";
import HistoryScreen from "../screens/HistoryScreen";
import MapScreen from "../screens/MapScreen";
import ClustersScreen from "../screens/ClustersScreen";
import ChatScreen from "../screens/ChatScreen";
import LoginScreen from "../screens/LoginScreen";
import SignupScreen from "../screens/SignupScreen";
import ProfileScreen from "../screens/ProfileScreen";

import { useSessionRestore } from "../hooks/useAuth";
import { useAppSelector } from "../store";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();

// ---------- THE TEST STACK ----------
//
// A STACK is for going DEEPER into one topic.
//   Entry -> Result -> Recommendation
// Each screen LEADS TO the next, and back works.
function TestStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#1b4332" },
        headerTintColor: "#fff",
      }}
    >
      <Stack.Screen
        name="SoilEntry"
        component={SoilEntryScreen}
        options={{ title: "New Soil Test" }}
      />
      <Stack.Screen
        name="Result"
        component={ResultScreen}
        options={{ title: "Reading Saved" }}
      />
      <Stack.Screen
        name="Recommendation"
        component={RecommendationScreen}
        options={{ title: "Fertilizer Advice" }}
      />
    </Stack.Navigator>
  );
}

// ---------- THE LOGIN STACK ----------
//
// Shown when nobody is logged in. Two screens, and the header is hidden
// because each one already has its own big title.
function LoginFlow() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  );
}

// ---------- THE MAIN TABS ----------
//
// TABS are for switching between SEPARATE areas that are
// equally important and not related to each other.
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: "#1b4332",
        tabBarInactiveTintColor: "#868e96",
        headerStyle: { backgroundColor: "#1b4332" },
        headerTintColor: "#fff",
      }}
    >
      <Tab.Screen
        name="Test"
        component={TestStack}
        options={{
          // The STACK inside already has a header.
          // Two headers would look wrong.
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>🌱</Text>
          ),
        }}
      />

      <Tab.Screen
        name="Trends"
        component={HistoryScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>📈</Text>
          ),
        }}
      />

      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          title: "Soil Map",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>🗺️</Text>
          ),
        }}
      />

      <Tab.Screen
        name="Regions"
        component={ClustersScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>🏞️</Text>
          ),
        }}
      />

      <Tab.Screen
        name="Ask"
        component={ChatScreen}
        options={{
          title: "Soil Advisor",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>💬</Text>
          ),
        }}
      />

      {/* NEW in Phase 9: the farmer's own account. */}
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: "My Account",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>👤</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ---------- THE GATE ----------
//
// This is the whole of Phase 9's navigation change.
//
// Three states, not two. The third one matters: while we are still reading
// the phone's storage we must show NEITHER screen. If we treated "do not
// know yet" as "logged out", a farmer who IS logged in would see the login
// screen flash up and vanish every time they opened the app. That looks
// broken even though nothing is wrong.
export default function AppNavigator() {
  const { checking } = useSessionRestore();
  const status = useAppSelector((s) => s.auth.status);

  if (checking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1b4332" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {status === "loggedIn" ? <MainTabs /> : <LoginFlow />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1, justifyContent: "center",
    alignItems: "center", backgroundColor: "#fff",
  },
});
