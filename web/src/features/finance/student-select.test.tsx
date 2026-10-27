// @vitest-environment jsdom
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchableStudentSelect } from './student-select';

describe('SearchableStudentSelect', () => {
  const dummyStudents = [
    { id: 's-1', name: 'Ana Silva', registration_number: 'MAT-001', active: 1 },
    { id: 's-2', name: 'Bruno Rocha', registration_number: 'MAT-002', active: 1 },
    { id: 's-3', name: 'Carlos Eduardo', registration_number: 'MAT-003', active: 0 },
  ];
  const dummyClasses = [{ id: 'c-1', name: 'Turma Alpha' }];
  const dummyEnrollments = [{ id: 'e-1', student_id: 's-1', class_id: 'c-1', status: 'ativa' }];

  it('renders input with search placeholder when no student is selected', () => {
    render(
      <SearchableStudentSelect
        value=""
        onChange={vi.fn()}
        students={dummyStudents}
        placeholder="Buscar aluno..."
      />,
    );

    expect(screen.getByPlaceholderText('Buscar aluno...')).toBeInTheDocument();
  });

  it('filters students by typing name and allows selecting one', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SearchableStudentSelect
        value=""
        onChange={handleChange}
        students={dummyStudents}
        classes={dummyClasses}
        enrollments={dummyEnrollments}
      />,
    );

    const input = screen.getByRole('combobox');
    await user.type(input, 'Bruno');

    const option = screen.getByRole('option', { name: /Bruno Rocha/i });
    expect(option).toBeInTheDocument();
    await user.click(option);

    expect(handleChange).toHaveBeenCalledWith(
      's-2',
      expect.objectContaining({ id: 's-2', name: 'Bruno Rocha' }),
    );
  });

  it('renders selected student card with matricula and class, and clears upon clicking Trocar', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SearchableStudentSelect
        value="s-1"
        onChange={handleChange}
        students={dummyStudents}
        classes={dummyClasses}
        enrollments={dummyEnrollments}
      />,
    );

    expect(screen.getByTestId('selected-student-card')).toBeInTheDocument();
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText(/Matrícula: MAT-001/)).toBeInTheDocument();
    expect(screen.getByText(/Turma: Turma Alpha/)).toBeInTheDocument();

    const clearBtn = screen.getByTitle('Alterar aluno');
    await user.click(clearBtn);

    expect(handleChange).toHaveBeenCalledWith('');
  });

  it('supports allowFreeText for custom inputs', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SearchableStudentSelect
        value=""
        onChange={handleChange}
        students={dummyStudents}
        allowFreeText={true}
      />,
    );

    const input = screen.getByRole('combobox');
    await user.type(input, 'Fornecedor XYZ');

    expect(handleChange).toHaveBeenCalledWith('Fornecedor XYZ');
  });
});
