import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '@/ui/theme/ThemeToggle';
import { loadTheme } from '@/services/theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeToggle', () => {
  it('names the theme it will switch to, not the one already active', async () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: /néon/i });
    await userEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe('neon');
  });

  it('remembers the choice', async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button'));
    expect(loadTheme()).toBe('neon');
  });

  it('switches back', async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('is reachable and operable from the keyboard', async () => {
    render(<ThemeToggle />);
    await userEvent.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(document.documentElement.dataset.theme).toBe('neon');
  });
});
