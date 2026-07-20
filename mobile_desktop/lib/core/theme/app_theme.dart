import 'package:flutter/material.dart';

class ItbColors {
  const ItbColors._();
  static const navy = Color(0xFF102A43);
  static const blue = Color(0xFF1769AA);
  static const cyan = Color(0xFF29B6C8);
  static const green = Color(0xFF2E9D65);
  static const orange = Color(0xFFF28C28);
  static const red = Color(0xFFD64550);
  static const canvas = Color(0xFFF4F7FA);
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: ItbColors.blue,
    primary: ItbColors.blue,
    secondary: ItbColors.cyan,
    surface: Colors.white,
    error: ItbColors.red,
    brightness: Brightness.light,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: ItbColors.canvas,
    fontFamily: 'Segoe UI',
    cardTheme: const CardThemeData(
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(18)),
      ),
    ),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: Color(0xFFD9E2EC)),
      ),
    ),
    navigationRailTheme: const NavigationRailThemeData(
      backgroundColor: ItbColors.navy,
      indicatorColor: Color(0xFFDCF3F7),
      selectedIconTheme: IconThemeData(color: ItbColors.navy),
      unselectedIconTheme: IconThemeData(color: Color(0xFFBCCCDC)),
      selectedLabelTextStyle: TextStyle(
        color: Colors.white,
        fontWeight: FontWeight.w700,
      ),
      unselectedLabelTextStyle: TextStyle(color: Color(0xFFBCCCDC)),
    ),
  );
}
