import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 sm:p-10 max-w-md w-full text-center">
        <div className="text-7xl font-black text-[#1e2a3a] leading-none mb-3">404</div>
        <div className="text-lg font-bold text-[#1e2a3a] mb-2">{t('notfound_title')}</div>
        <p className="text-sm text-gray-400 mb-7">{t('notfound_desc')}</p>
        <Link to="/" className="btn btn-primary inline-flex justify-center py-2.5 px-6">
          {t('notfound_back_home')}
        </Link>
      </div>
    </div>
  );
}