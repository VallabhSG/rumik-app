import React from 'react';
import { render } from '@testing-library/react-native';
import { Pill } from '../../../components/ui/Pill';

describe('Pill', () => {
  it('renders the label text', () => {
    const { getByText } = render(<Pill label="electronic" />);
    expect(getByText('electronic')).toBeTruthy();
  });

  it('applies active styles when active=true', () => {
    const { getByText } = render(<Pill label="electronic" active />);
    const text = getByText('electronic');
    expect(text.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: '#fdfcfa' })])
    );
  });
});
