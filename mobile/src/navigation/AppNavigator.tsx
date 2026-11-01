import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";

import SoilEntryScreen from "../screens/SoilEntryScreen";
import ResultScreen from "../screens/ResultScreen";
import RecommendationScreen from "../screens/RecommendationScreen";
import HistoryScreen from "../screens/HistoryScreen";
import MapScreen from "../screens/MapScreen";
import ClustersScreen from "../screens/ClustersScreen";
import ChatScreen from "../screens/ChatScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

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

// ---------- THE MAIN TABS ----------
//
// TABS are for switching between SEPARATE areas that are
// equally important and not related to each other.
export default function AppNavigator() {
  return (
    <NavigationContainer>
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
      </Tab.Navigator>
    </NavigationContainer>
  );
}
