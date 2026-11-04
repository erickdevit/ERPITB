-- Migration 0011: Preserve and restore historical enrollments
-- When students move between classes, past enrollments are archived as 'concluida'
-- rather than soft-deleted, keeping attendance and grade history intact.
UPDATE enrollments
   SET status = 'concluida', deleted_at = NULL, updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE deleted_at IS NOT NULL
   AND (
     EXISTS (
       SELECT 1 FROM attendance_records a
        WHERE a.class_id = enrollments.class_id
          AND a.student_id = enrollments.student_id
          AND a.deleted_at IS NULL
     )
     OR EXISTS (
       SELECT 1 FROM student_grades sg
        JOIN grade_tables gt ON gt.id = sg.grade_table_id
       WHERE gt.class_id = enrollments.class_id
         AND sg.student_id = enrollments.student_id
         AND sg.deleted_at IS NULL
     )
   );
