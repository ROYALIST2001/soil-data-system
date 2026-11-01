import React from "react";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text, View, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
import ReliefScreen from "../screens/ReliefScreen";
import SubsidyScreen from "../screens/SubsidyScreen";
import InsightsScreen from "../screens/InsightsScreen";
import ServicesScreen from "../screens/ServicesScreen";
import AppButton from "../components/AppButton";
import Icon from "../components/Icon";
import { colors } from "../theme";
import { useAuth, useSessionRestore } from "../hooks/useAuth";
import { useLands, useLandsBootstrap } from "../hooks/useLands";
import { useAppSelector } from "../store";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();
const LandStack = createNativeStackNavigator();
const InsightStack = createNativeStackNavigator();
const ServiceStack = createNativeStackNavigator();

const navigationTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: colors.primary, background: colors.background,
    card: colors.background, text: colors.text, border: colors.border },
};

const headerOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.forest,
  headerTitleStyle: { fontSize: 17, fontWeight: "700" as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

function TestStack() {
  return (
    <Stack.Navigator screenOptions={headerOptions}>
      <Stack.Screen name="SoilEntry" component={SoilEntryScreen} options={{ title: "Soil Data System" }} />
      <Stack.Screen name="Result" component={ResultScreen} options={{ title: "Your soil test" }} />
      <Stack.Screen name="Recommendation" component={RecommendationScreen} options={{ title: "Fertilizer advice" }} />
    </Stack.Navigator>
  );
}

function LoginFlow() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  );
}

function LandsStack() {
  return (
    <LandStack.Navigator screenOptions={headerOptions}>
      <LandStack.Screen name="MyLands" component={MyLandsScreen} options={{ title: "My lands" }} />
      <LandStack.Screen name="AddLand" component={AddLandScreen} options={{ title: "Register land" }} />
      <LandStack.Screen name="AddCrop" component={AddCropScreen} options={{ title: "Add a crop" }} />
    </LandStack.Navigator>
  );
}

function InsightsStack() {
  return (
    <InsightStack.Navigator screenOptions={headerOptions}>
      <InsightStack.Screen name="InsightsHome" component={InsightsScreen} options={{ title: "Soil insights" }} />
      <InsightStack.Screen name="Trends" component={HistoryScreen} options={{ title: "Soil trends" }} />
      <InsightStack.Screen name="Map" component={MapScreen} options={{ title: "Soil map" }} />
      <InsightStack.Screen name="Regions" component={ClustersScreen} options={{ title: "Regional patterns" }} />
    </InsightStack.Navigator>
  );
}

function ServicesStack() {
  return (
    <ServiceStack.Navigator screenOptions={headerOptions}>
      <ServiceStack.Screen name="ServicesHome" component={ServicesScreen} options={{ title: "Farmer services" }} />
      <ServiceStack.Screen name="Relief" component={ReliefScreen} options={{ title: "Disaster relief" }} />
      <ServiceStack.Screen name="Subsidy" component={SubsidyScreen} options={{ title: "Fertilizer subsidy" }} />
      <ServiceStack.Screen name="Profile" component={ProfileScreen} options={{ title: "My account" }} />
    </ServiceStack.Navigator>
  );
}

const tabs = [
  { name: "Test", label: "Test", icon: "sprout", component: TestStack },
  { name: "Insights", label: "Insights", icon: "chart", component: InsightsStack },
  { name: "Ask", label: "Advisor", icon: "chat", component: ChatScreen },
  { name: "Lands", label: "Lands", icon: "field", component: LandsStack },
  { name: "Services", label: "Services", icon: "grid", component: ServicesStack },
] as const;

function MainTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator screenOptions={{
      ...headerOptions,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarHideOnKeyboard: true,
      tabBarLabelStyle: { fontSize: 10, fontWeight: "600", marginTop: 3 },
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border,
        height: 64 + Math.max(insets.bottom, 10), paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), elevation: 0 },
    }}>
      {tabs.map((tab) => (
        <Tab.Screen key={tab.name} name={tab.name} component={tab.component} options={{
          title: tab.name === "Ask" ? "Soil advisor" : tab.label,
          tabBarLabel: tab.label,
          headerShown: tab.name === "Ask",
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIcon, focused && styles.tabIconActive]}><Icon name={tab.icon} size={22} color={color} /></View>
          ),
        }} />
      ))}
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { checking } = useSessionRestore();
  const status = useAppSelector((s) => s.auth.status);
  const { checking: loadingLands } = useLandsBootstrap();
  const setupDone = useAppSelector((s) => s.land.setupDone);
  const landStatus = useAppSelector((s) => s.land.status);
  const landError = useAppSelector((s) => s.land.errorMessage);
  const { reload } = useLands();
  const { logout } = useAuth();

  if (checking || (status === "loggedIn" && loadingLands && landStatus !== "error")) {
    return (
      <View style={styles.loading}>
        <View style={styles.loadingMark}><Icon name="sprout" size={40} color={colors.lime} /></View>
        <Text style={styles.loadingTitle}>Good things take root.</Text>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        <Text style={styles.loadingText}>{checking ? "Getting things ready..." : "Loading your land..."}</Text>
      </View>
    );
  }

  if (status !== "loggedIn") {
    return <NavigationContainer theme={navigationTheme}><LoginFlow /></NavigationContainer>;
  }

  if (landStatus === "error") {
    return (
      <View style={styles.loading}>
        <Icon name="refresh" size={36} />
        <Text style={styles.errorTitle}>Let’s reconnect</Text>
        <Text style={styles.errorText}>{landError}</Text>
        <AppButton title="Try again" onPress={reload} icon="refresh" />
        <AppButton title="Log out" onPress={logout} variant="secondary" style={{ marginTop: 12 }} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      {setupDone ? <MainTabs /> : <LandSetupScreen />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background, padding: 30 },
  loadingMark: { width: 86, height: 86, borderRadius: 28, backgroundColor: colors.forest, justifyContent: "center", alignItems: "center", marginBottom: 24 },
  loadingTitle: { fontSize: 24, fontWeight: "700", color: colors.forest, textAlign: "center" },
  loadingText: { marginTop: 14, fontSize: 13, color: colors.muted },
  errorTitle: { fontSize: 24, fontWeight: "700", color: colors.forest, marginTop: 20, marginBottom: 10, textAlign: "center" },
  errorText: { fontSize: 14, color: colors.secondary, textAlign: "center", lineHeight: 22, marginBottom: 24 },
  tabIcon: { width: 46, height: 30, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tabIconActive: { backgroundColor: colors.sage },
});
