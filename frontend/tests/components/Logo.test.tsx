import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Logo from '../../components/Logo';

const usePathnameMock = vi.fn(() => '/');

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
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

  it('applies steam class on steam pages', () => {
    usePathnameMock.mockReturnValue('/steam');
    render(<Logo />);
    const link = screen.getByRole('link');
    expect(link.className).toContain('group-steam');
  });

  it('applies xbox class on xbox pages', () => {
    usePathnameMock.mockReturnValue('/xbox');
    render(<Logo />);
    const link = screen.getByRole('link');
    expect(link.className).toContain('group-xbox');
  });

  it('applies playstation class on playstation pages', () => {
    usePathnameMock.mockReturnValue('/playstation');
    render(<Logo />);
    const link = screen.getByRole('link');
    expect(link.className).toContain('group-playstation');
  });
});
