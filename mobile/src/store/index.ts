import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector, TypedUseSelectorHook } from "react-redux";
import readingReducer from "./readingSlice";

// Build the ONE store from all our slices.
// We have one slice now. We will add more in later phases.
export const store = configureStore({
  reducer: {
    reading: readingReducer,
  },
});

// These types are worked out AUTOMATICALLY from the store above.
// Because they are automatic, they can never become out of date.
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed versions of the Redux hooks.
// These know what is inside OUR store, so the editor can help you.
// ALWAYS use these in screens. Never use the plain useDispatch/useSelector.
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
