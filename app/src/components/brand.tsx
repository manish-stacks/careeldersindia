import Svg, { Path } from 'react-native-svg';

export function Heart({ size = 44, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path d="M16 27s-10-6.2-10-13.5A5.6 5.6 0 0 1 16 9.8a5.6 5.6 0 0 1 10 3.7C26 20.8 16 27 16 27z" fill={color} />
    </Svg>
  );
}

