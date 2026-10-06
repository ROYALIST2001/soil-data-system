import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector, TypedUseSelectorHook } from "react-redux";
import readingReducer from "./readingSlice";
import recommendationReducer from "./recommendationSlice";
import analyticsReducer from "./analyticsSlice";
import chatReducer from "./chatSlice";
import authReducer from "./authSlice"; // NEW

// Build the ONE store from all our slices.
// Five slices now. Each one owns ONE topic.
export const store = configureStore({
  reducer: {
    reading: readingReducer,
    recommendation: recommendationReducer,
    analytics: analyticsReducer,
    chat: chatReducer,
    auth: authReducer, // NEW
  },
});

// Worked out AUTOMATICALLY from the store above.
// Adding the slice updated RootState with NO extra work.
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
