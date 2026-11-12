import { createFileRoute } from '@tanstack/react-router';
import { RecommendPage } from '@/features/v4/programs/pages/RecommendPage';

export const Route = createFileRoute('/recommend/$pid/$student')({
  component: RecommendPage,
});
