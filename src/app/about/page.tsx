import {AboutPage} from '@/components/about/AboutPage';

export const metadata = {
  title: 'О нас · Cloud FinOps',
  description:
    'Открытое сообщество практиков FinOps: сравниваем публичные облака в России проще и прозрачнее.',
};

export default function AboutRoute() {
  return <AboutPage />;
}
