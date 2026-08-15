import 'dart:async';
import 'package:flutter/material.dart';
import 'app_theme.dart';

/// Standardized Page Header across all application screens.
class ItbPageHeader extends StatelessWidget {
  const ItbPageHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.action,
    this.leading,
    this.badges,
  });

  final String title;
  final String? subtitle;
  final Widget? action;
  final Widget? leading;
  final List<Widget>? badges;

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 700;

    final titleBlock = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (leading != null) ...[leading!, const SizedBox(width: 8)],
            Flexible(
              child: Text(
                title,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: ItbColors.navy,
                      fontSize: compact ? 20 : 24,
                    ),
              ),
            ),
          ],
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 4),
          Text(
            subtitle!,
            style: const TextStyle(
              color: ItbColors.textSecondary,
              fontSize: 13,
            ),
          ),
        ],
        if (badges != null && badges!.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(spacing: 6, runSpacing: 6, children: badges!),
        ],
      ],
    );

    if (compact) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          titleBlock,
          if (action != null) ...[
            const SizedBox(height: 14),
            action!,
          ],
        ],
      );
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(child: titleBlock),
        if (action != null) ...[
          const SizedBox(width: 16),
          action!,
        ],
      ],
    );
  }
}

/// Standardized Filter Card component with built-in search debounce and responsive layout.
class ItbFilterCard extends StatefulWidget {
  const ItbFilterCard({
    super.key,
    this.searchHint = 'Buscar...',
    this.searchValue = '',
    this.onSearchChanged,
    this.filters = const [],
    this.actions = const [],
    this.collapsible = true,
  });

  final String searchHint;
  final String searchValue;
  final ValueChanged<String>? onSearchChanged;
  final List<Widget> filters;
  final List<Widget> actions;
  final bool collapsible;

  @override
  State<ItbFilterCard> createState() => _ItbFilterCardState();
}

class _ItbFilterCardState extends State<ItbFilterCard> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.searchValue);
  Timer? _debounce;
  bool _expanded = true;

  @override
  void didUpdateWidget(covariant ItbFilterCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.searchValue != _controller.text &&
        widget.searchValue != oldWidget.searchValue) {
      _controller.text = widget.searchValue;
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      widget.onSearchChanged?.call(value);
    });
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 700;
    final hasFilters = widget.filters.isNotEmpty || widget.actions.isNotEmpty;

    return Card(
      child: Padding(
        padding: EdgeInsets.all(compact ? 12 : 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    onChanged: _onChanged,
                    decoration: InputDecoration(
                      isDense: true,
                      prefixIcon: const Icon(Icons.search, size: 20),
                      labelText: widget.searchHint,
                      suffixIcon: _controller.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear, size: 18),
                              onPressed: () {
                                _controller.clear();
                                widget.onSearchChanged?.call('');
                                setState(() {});
                              },
                            )
                          : null,
                    ),
                  ),
                ),
                if (compact && widget.collapsible && hasFilters) ...[
                  const SizedBox(width: 8),
                  IconButton.outlined(
                    tooltip: _expanded ? 'Recolher filtros' : 'Expandir filtros',
                    style: IconButton.styleFrom(
                      side: const BorderSide(color: ItbColors.surfaceBorder),
                      backgroundColor: _expanded
                          ? ItbColors.blueLight
                          : Colors.transparent,
                    ),
                    onPressed: () => setState(() => _expanded = !_expanded),
                    icon: Icon(
                      _expanded ? Icons.filter_list_off : Icons.filter_list,
                      color: _expanded ? ItbColors.blue : ItbColors.navy,
                      size: 20,
                    ),
                  ),
                ],
              ],
            ),
            if (hasFilters && (!compact || _expanded)) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  ...widget.filters,
                  ...widget.actions,
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Standardized Status Badge component with semantic colors.
class ItbStatusBadge extends StatelessWidget {
  const ItbStatusBadge({
    super.key,
    required this.label,
    required this.color,
    required this.backgroundColor,
    this.icon,
  });

  final String label;
  final Color color;
  final Color backgroundColor;
  final IconData? icon;

  factory ItbStatusBadge.present() => const ItbStatusBadge(
        label: 'Presente',
        color: ItbColors.present,
        backgroundColor: ItbColors.presentBg,
        icon: Icons.check_circle_outline,
      );

  factory ItbStatusBadge.absent() => const ItbStatusBadge(
        label: 'Falta',
        color: ItbColors.absent,
        backgroundColor: ItbColors.absentBg,
        icon: Icons.cancel_outlined,
      );

  factory ItbStatusBadge.justified() => const ItbStatusBadge(
        label: 'Justificada',
        color: ItbColors.justified,
        backgroundColor: ItbColors.justifiedBg,
        icon: Icons.description_outlined,
      );

  factory ItbStatusBadge.delayed() => const ItbStatusBadge(
        label: 'Atraso',
        color: ItbColors.delayed,
        backgroundColor: ItbColors.delayedBg,
        icon: Icons.schedule,
      );

  factory ItbStatusBadge.replacement() => const ItbStatusBadge(
        label: 'Reposição',
        color: ItbColors.replacement,
        backgroundColor: ItbColors.replacementBg,
        icon: Icons.event_repeat,
      );

  factory ItbStatusBadge.enrollment(String status) {
    switch (status.toLowerCase()) {
      case 'ativa':
        return const ItbStatusBadge(
          label: 'Ativa',
          color: ItbColors.green,
          backgroundColor: ItbColors.greenBg,
          icon: Icons.check_circle_outline,
        );
      case 'trancada':
        return const ItbStatusBadge(
          label: 'Trancada',
          color: ItbColors.orange,
          backgroundColor: ItbColors.orangeBg,
          icon: Icons.pause_circle_outline,
        );
      case 'concluida':
      case 'concluída':
        return const ItbStatusBadge(
          label: 'Concluída',
          color: ItbColors.blue,
          backgroundColor: ItbColors.blueLight,
          icon: Icons.school_outlined,
        );
      default:
        return ItbStatusBadge(
          label: status,
          color: ItbColors.textSecondary,
          backgroundColor: ItbColors.surfaceMuted,
        );
    }
  }

  factory ItbStatusBadge.userActive(bool active) {
    return active
        ? const ItbStatusBadge(
            label: 'Ativo',
            color: ItbColors.green,
            backgroundColor: ItbColors.greenBg,
            icon: Icons.check_circle_outline,
          )
        : const ItbStatusBadge(
            label: 'Inativo',
            color: ItbColors.textMuted,
            backgroundColor: ItbColors.surfaceMuted,
            icon: Icons.block_outlined,
          );
  }

  factory ItbStatusBadge.kids() => const ItbStatusBadge(
        label: 'Kids',
        color: Color(0xFFC05621),
        backgroundColor: Color(0xFFFEEBC8),
        icon: Icons.child_care,
      );

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.25), width: 0.8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

/// Standardized Metric Card for Dashboard & Overview statistics.
class ItbMetricCard extends StatelessWidget {
  const ItbMetricCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    this.width,
    this.compact = false,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final double? width;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final content = Card(
      child: Padding(
        padding: EdgeInsets.all(compact ? 14 : 18),
        child: Flex(
          direction: compact ? Axis.vertical : Axis.horizontal,
          crossAxisAlignment: compact
              ? CrossAxisAlignment.start
              : CrossAxisAlignment.center,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              alignment: Alignment.center,
              child: Icon(icon, color: color, size: 24),
            ),
            SizedBox(width: compact ? 0 : 14, height: compact ? 10 : 0),
            Expanded(
              flex: compact ? 0 : 1,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    value,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                      color: ItbColors.navy,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: ItbColors.textSecondary,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );

    if (width != null) {
      return SizedBox(width: width, child: content);
    }
    return content;
  }
}

/// Standardized Empty State placeholder across lists, tables, and search results.
class ItbEmptyState extends StatelessWidget {
  const ItbEmptyState({
    super.key,
    required this.title,
    this.subtitle,
    this.icon = Icons.inbox_outlined,
    this.action,
  });

  final String title;
  final String? subtitle;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: ItbColors.surfaceMuted,
                shape: BoxShape.circle,
                border: Border.all(color: ItbColors.surfaceBorder),
              ),
              alignment: Alignment.center,
              child: Icon(icon, size: 30, color: ItbColors.textMuted),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: ItbColors.navy,
              ),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 380),
                child: Text(
                  subtitle!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 13,
                    color: ItbColors.textSecondary,
                  ),
                ),
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: 20),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}

/// Responsive Modal Helper: Opens a centered Dialog on Desktop and a draggable BottomSheet on Mobile.
Future<T?> showItbModal<T>({
  required BuildContext context,
  required String title,
  required Widget Function(BuildContext context, StateSetter setModalState)
      builder,
  List<Widget> Function(BuildContext context)? actions,
  double maxWidth = 500,
}) {
  final compact = MediaQuery.sizeOf(context).width < 700;

  if (compact) {
    return showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) {
          final actionWidgets = actions?.call(context) ?? [];
          return Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.viewInsetsOf(context).bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    margin: const EdgeInsets.only(top: 12, bottom: 8),
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: ItbColors.surfaceBorder,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: ItbColors.navy,
                          ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, size: 20),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1),
                Flexible(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(20),
                    child: builder(context, setModalState),
                  ),
                ),
                if (actionWidgets.isNotEmpty) ...[
                  const Divider(height: 1),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: actionWidgets,
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  return showDialog<T>(
    context: context,
    builder: (dialogCtx) => StatefulBuilder(
      builder: (context, setModalState) {
        final actionWidgets = actions?.call(context) ?? [];
        return AlertDialog(
          titlePadding: const EdgeInsets.fromLTRB(24, 20, 16, 12),
          contentPadding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
          actionsPadding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
          title: Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                    color: ItbColors.navy,
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 20),
                onPressed: () => Navigator.pop(dialogCtx),
              ),
            ],
          ),
          content: SizedBox(
            width: maxWidth,
            child: SingleChildScrollView(
              child: builder(context, setModalState),
            ),
          ),
          actions: actionWidgets.isNotEmpty ? actionWidgets : null,
        );
      },
    ),
  );
}
