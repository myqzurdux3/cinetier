import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('component test environment', () => {
  it('renders into a DOM', () => {
    render(<h1>Cinetier</h1>);
    expect(screen.getByRole('heading', { name: 'Cinetier' })).toBeInTheDocument();
  });
});
