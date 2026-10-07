import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  Text, View, ActivityIndicator, StyleSheet, TouchableOpacity,
} from "react-native";

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
import LandSetupScreen from "../screens/LandSetupScreen";
import MyLandsScreen from "../screens/MyLandsScreen";
import AddLandScreen from "../screens/AddLandScreen";
import AddCropScreen from "../screens/AddCropScreen";

import { useAuth, useSessionRestore } from "../hooks/useAuth";
import { useLands, useLandsBootstrap } from "../hooks/useLands";
import { useAppSelector } from "../store";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();
const LandStack = createNativeStackNavigator();

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

// ---------- THE LANDS STACK ----------
//
// My Lands -> Add Land -> Add Crop. Going DEEPER into one topic, so a stack,
// not tabs. Same reasoning as the Test stack above.
function LandsStack() {
  return (
    <LandStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#1b4332" },
        headerTintColor: "#fff",
      }}
    >
      <LandStack.Screen
        name="MyLands"
        component={MyLandsScreen}
        options={{ title: "My Lands" }}
      />
      <LandStack.Screen
        name="AddLand"
        component={AddLandScreen}
        options={{ title: "Register Land" }}
      />
      <LandStack.Screen
        name="AddCrop"
        component={AddCropScreen}
        options={{ title: "Add Crop" }}
      />
    </LandStack.Navigator>
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

      {/* NEW in Phase 9: the farmer's own land and crops. */}
      <Tab.Screen
        name="Lands"
        component={LandsStack}
        options={{
          // The stack inside has its own header.
          headerShown: false,
          tabBarLabel: "My Lands",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>🌾</Text>
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

  // NEW in Phase 9: load this farmer's lands as soon as we know who they are.
  const { checking: loadingLands } = useLandsBootstrap();
  const setupDone = useAppSelector((s) => s.land.setupDone);
  const landStatus = useAppSelector((s) => s.land.status);
  const landError = useAppSelector((s) => s.land.errorMessage);
  const { reload } = useLands();
  const { logout } = useAuth();

  const loggedIn = status === "loggedIn";

  if (checking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1b4332" />
      </View>
    );
  }

  if (!loggedIn) {
    return (
      <NavigationContainer>
        <LoginFlow />
      </NavigationContainer>
    );
  }

  // Could not load the lands at all.
  //
  // NEVER leave the farmer on a spinner with no way out. Before this, a
  // failed load meant an endless spinner and no explanation - the app simply
  // looked broken. Now they see what went wrong and can retry or log out.
  if (landStatus === "error") {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorTitle}>Cannot reach the server</Text>
        <Text style={styles.errorText}>{landError}</Text>

        <TouchableOpacity style={styles.retryButton} onPress={reload}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutLink} onPress={logout}>
          <Text style={styles.logoutLinkText}>Log out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Logged in, but we do not yet know whether they have any land. Showing
  // either screen now would be a guess, and a wrong guess means the farmer
  // watches the land registration form appear and vanish.
  if (loadingLands) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1b4332" />
        <Text style={styles.loadingText}>Loading your land...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {setupDone ? <MainTabs /> : <LandSetupScreen />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1, justifyContent: "center",
    alignItems: "center", backgroundColor: "#fff", padding: 30,
  },
  loadingText: { marginTop: 14, fontSize: 13, color: "#868e96" },

  errorTitle: {
    fontSize: 18, fontWeight: "bold",
    color: "#1b4332", marginBottom: 10, textAlign: "center",
  },
  errorText: {
    fontSize: 14, color: "#868e96",
    textAlign: "center", lineHeight: 20, marginBottom: 22,
  },
  retryButton: {
    backgroundColor: "#1b4332", borderRadius: 8,
    paddingVertical: 12, paddingHorizontal: 30,
  },
  retryText: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  logoutLink: { paddingVertical: 16 },
  logoutLinkText: { color: "#868e96", fontSize: 13 },
});
