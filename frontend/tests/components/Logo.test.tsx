import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Logo from '../../components/Logo';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}));

describe('Logo', () => {
  it('renders the application name', () => {
    render(<Logo />);
    expect(screen.getByText('cpak')).toBeInTheDocument();
  });

  it('renders a link back to the home page', () => {
    render(<Logo />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders the bracket characters', () => {
    const { getAllByText } = render(<Logo />);
    expect(getAllByText(/[\[\]]/)).toBeTruthy();
  });
});
