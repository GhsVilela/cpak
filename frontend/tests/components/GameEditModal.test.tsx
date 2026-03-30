import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameEditModal from '../../components/GameEditModal';

const mockGame = {
  _id: 'game-1',
  gameId: '730',
  title: 'Counter-Strike 2',
  platform: 'steam',
  capsuleImagePath: 'steam/730/game_grid.jpg',
  iconImagePath: 'steam/730/game_icon.jpg',
  heroImagePath: 'steam/730/game_hero.jpg',
};

describe('GameEditModal', () => {
  it('renders with game title pre-filled', () => {
    render(<GameEditModal game={mockGame} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByDisplayValue('Counter-Strike 2')).toBeInTheDocument();
    expect(screen.getByText('Edit Game')).toBeInTheDocument();
  });

  it('renders with customTitle when set', () => {
    const game = { ...mockGame, customTitle: 'CS2' };
    render(<GameEditModal game={game} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByDisplayValue('CS2')).toBeInTheDocument();
  });

  it('shows original title label', () => {
    render(<GameEditModal game={mockGame} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText('Original: Counter-Strike 2')).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<GameEditModal game={mockGame} onClose={onClose} onSave={vi.fn()} />);
    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when X button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<GameEditModal game={mockGame} onClose={onClose} onSave={vi.fn()} />);
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onSave with updated title and closes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<GameEditModal game={mockGame} onClose={onClose} onSave={onSave} />);

    const input = screen.getByDisplayValue('Counter-Strike 2');
    await user.clear(input);
    await user.type(input, 'CS2');
    await user.click(screen.getByText('Save Changes'));

    expect(onSave).toHaveBeenCalledWith({
      customTitle: 'CS2',
      images: undefined,
    });
  });

  it('shows Reset button when title differs from original', async () => {
    const game = { ...mockGame, customTitle: 'CS2' };
    const user = userEvent.setup();
    render(<GameEditModal game={game} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText('Reset')).toBeInTheDocument();

    await user.click(screen.getByText('Reset'));
    expect(screen.getByDisplayValue('Counter-Strike 2')).toBeInTheDocument();
  });

  it('has upload buttons for all image types', () => {
    render(<GameEditModal game={mockGame} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText('Upload Icon')).toBeInTheDocument();
    expect(screen.getByText('Upload Hero')).toBeInTheDocument();
    expect(screen.getByText('Upload Capsule')).toBeInTheDocument();
  });

  it('shows error for oversized file', async () => {
    const user = userEvent.setup();
    render(<GameEditModal game={mockGame} onClose={vi.fn()} onSave={vi.fn()} />);

    // Create a mock file > 10MB
    const bigFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, bigFile);

    expect(screen.getByText('File exceeds 10MB limit')).toBeInTheDocument();
  });

  it('shows error when save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Server error'));
    const user = userEvent.setup();
    render(<GameEditModal game={mockGame} onClose={vi.fn()} onSave={onSave} />);

    const input = screen.getByDisplayValue('Counter-Strike 2');
    await user.clear(input);
    await user.type(input, 'New Title');
    await user.click(screen.getByText('Save Changes'));

    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });
});
