import { render, screen } from '@testing-library/react-native';

import Index from '@/app/index';

describe('CP01 foundation route', () => {
  it('renders the app name', () => {
    render(<Index />);
    expect(screen.getByRole('header')).toHaveTextContent('SipSure');
  });
});
