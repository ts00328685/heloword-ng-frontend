import React from 'react';
import { useTranslation } from 'react-i18next';
import ArticlePreviewSection from './ArticlePreviewSection';

const ENSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <ArticlePreviewSection
      sourceLang="en"
      title={t('home.enArticleTitle')}
      listRoute="/en-articles"
      detailRoutePrefix="/en-articles"
      viewAllLabel={t('home.viewAll')}
    />
  );
};

export default ENSection;
