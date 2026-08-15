import 'package:flutter/material.dart';

class ItbColors {
  const ItbColors._();

  // Brand Identity
  static const navy = Color(0xFF0F2B48);
  static const navyLight = Color(0xFF1E3A5F);
  static const blue = Color(0xFF1976D2);
  static const blueLight = Color(0xFFE3F2FD);
  static const cyan = Color(0xFF00ACC1);
  static const cyanLight = Color(0xFFE0F7FA);

  // Background & Surfaces
  static const canvas = Color(0xFFF6F8FB);
  static const surface = Colors.white;
  static const surfaceBorder = Color(0xFFE2E8F0);
  static const surfaceMuted = Color(0xFFF8FAFC);

  // Typography & Neutrals
  static const textPrimary = Color(0xFF0F172A);
  static const textSecondary = Color(0xFF475569);
  static const textMuted = Color(0xFF94A3B8);

  // Semantic Status Colors
  static const green = Color(0xFF2E7D32);
  static const greenBg = Color(0xFFE8F5E9);
  static const red = Color(0xFFD32F2F);
  static const redBg = Color(0xFFFFEBEE);
  static const orange = Color(0xFFF57C00);
  static const orangeBg = Color(0xFFFFF3E0);
  static const purple = Color(0xFF7B1FA2);
  static const purpleBg = Color(0xFFF3E5F5);

  // Attendance Status Mappings
  static const present = green;
  static const presentBg = greenBg;
  static const absent = red;
  static const absentBg = redBg;
  static const justified = cyan;
  static const justifiedBg = cyanLight;
  static const delayed = orange;
  static const delayedBg = orangeBg;
  static const replacement = purple;
  static const replacementBg = purpleBg;
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: ItbColors.blue,
    primary: ItbColors.blue,
    onPrimary: Colors.white,
    primaryContainer: ItbColors.blueLight,
    onPrimaryContainer: ItbColors.navy,
    secondary: ItbColors.cyan,
    onSecondary: Colors.white,
    secondaryContainer: ItbColors.cyanLight,
    onSecondaryContainer: ItbColors.navy,
    surface: ItbColors.surface,
    onSurface: ItbColors.textPrimary,
    error: ItbColors.red,
    onError: Colors.white,
    errorContainer: ItbColors.redBg,
    onErrorContainer: ItbColors.red,
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
      color: ItbColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(16)),
        side: BorderSide(color: ItbColors.surfaceBorder, width: 1),
      ),
    ),
    appBarTheme: const AppBarTheme(
      elevation: 0,
      scrolledUnderElevation: 0,
      backgroundColor: Colors.white,
      foregroundColor: ItbColors.navy,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontFamily: 'Segoe UI',
        fontSize: 18,
        fontWeight: FontWeight.w800,
        color: ItbColors.navy,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      labelStyle: const TextStyle(color: ItbColors.textSecondary, fontSize: 14),
      hintStyle: const TextStyle(color: ItbColors.textMuted, fontSize: 14),
      prefixIconColor: ItbColors.textMuted,
      suffixIconColor: ItbColors.textMuted,
      border: OutlineInputBorder(
        borderRadius: const BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: ItbColors.surfaceBorder),
      ),
      enabledBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: ItbColors.surfaceBorder),
      ),
      focusedBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: ItbColors.blue, width: 1.5),
      ),
      errorBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: ItbColors.red),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        elevation: 0,
        backgroundColor: ItbColors.blue,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(12)),
        ),
        textStyle: const TextStyle(
          fontFamily: 'Segoe UI',
          fontWeight: FontWeight.w700,
          fontSize: 14,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: ItbColors.navy,
        side: const BorderSide(color: ItbColors.surfaceBorder),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(12)),
        ),
        textStyle: const TextStyle(
          fontFamily: 'Segoe UI',
          fontWeight: FontWeight.w600,
          fontSize: 14,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: ItbColors.blue,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(10)),
        ),
        textStyle: const TextStyle(
          fontFamily: 'Segoe UI',
          fontWeight: FontWeight.w600,
          fontSize: 14,
        ),
      ),
    ),
    chipTheme: const ChipThemeData(
      backgroundColor: ItbColors.surfaceMuted,
      labelStyle: TextStyle(
        fontFamily: 'Segoe UI',
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: ItbColors.textPrimary,
      ),
      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(8)),
        side: BorderSide(color: ItbColors.surfaceBorder, width: 0.8),
      ),
    ),
    dialogTheme: const DialogThemeData(
      elevation: 6,
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(18)),
      ),
      titleTextStyle: TextStyle(
        fontFamily: 'Segoe UI',
        fontSize: 20,
        fontWeight: FontWeight.w800,
        color: ItbColors.navy,
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      elevation: 8,
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
    ),
    dataTableTheme: const DataTableThemeData(
      headingRowColor: WidgetStatePropertyAll(ItbColors.surfaceMuted),
      dataRowColor: WidgetStatePropertyAll(Colors.white),
      headingTextStyle: TextStyle(
        fontFamily: 'Segoe UI',
        fontWeight: FontWeight.w800,
        fontSize: 13,
        color: ItbColors.navy,
      ),
      dataTextStyle: TextStyle(
        fontFamily: 'Segoe UI',
        fontSize: 13,
        color: ItbColors.textPrimary,
      ),
      dividerThickness: 1,
      horizontalMargin: 20,
      columnSpacing: 24,
    ),
    navigationRailTheme: const NavigationRailThemeData(
      backgroundColor: ItbColors.navy,
      indicatorColor: Color(0xFF224A73),
      selectedIconTheme: IconThemeData(color: Colors.white),
      unselectedIconTheme: IconThemeData(color: Color(0xFF94A3B8)),
      selectedLabelTextStyle: TextStyle(
        fontFamily: 'Segoe UI',
        color: Colors.white,
        fontWeight: FontWeight.w700,
        fontSize: 13,
      ),
      unselectedLabelTextStyle: TextStyle(
        fontFamily: 'Segoe UI',
        color: Color(0xFF94A3B8),
        fontWeight: FontWeight.w500,
        fontSize: 13,
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: ItbColors.surfaceBorder,
      thickness: 1,
      space: 1,
    ),
  );
}
