import React from 'react';
import Header from '../../components/Header';
import { environment } from '../../config/environment';

const InfoPage: React.FC = () => {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header title="About" />

      <main className="flex-1 pb-20 px-4 pt-6 max-w-2xl mx-auto w-full">
        {/* App card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4 shadow-sm text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl mx-auto mb-3 flex items-center justify-center shadow-md">
            <span className="text-white text-2xl font-black">Hw</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900">Heloword</h2>
          <p className="text-xs text-gray-400 mt-1">v{environment.appVersion}</p>
          <p className="text-sm text-gray-500 mt-3 leading-relaxed">
            A vocabulary learning app with spaced repetition. Practice English, German, and Japanese
            words & sentences with an interactive quiz system.
          </p>
        </div>

        {/* Developer card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Developer</h3>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <span className="text-blue-500 font-bold text-lg">RT</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">Ryan Tseng</p>
              <p className="text-xs text-gray-400">Full-Stack Developer</p>
            </div>
            <a
              href="https://www.linkedin.com/in/ryan-tseng"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              LinkedIn
            </a>
          </div>
        </div>

        {/* Learning science card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-2">How It Works</h3>
          <p className="text-sm text-gray-500 leading-relaxed mb-3">
            Heloword is based on the <strong>Forgetting Curve</strong> principle — words you answer
            incorrectly are queued for re-testing later, reinforcing memory through spaced repetition.
          </p>
          <a
            href="https://en.wikipedia.org/wiki/Forgetting_curve"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline"
          >
            Learn about the Forgetting Curve on Wikipedia →
          </a>
        </div>

        {/* Features card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Features</h3>
          <ul className="space-y-2">
            {[
              '🌍 English, German & Japanese vocabulary',
              '🔊 Text-to-speech pronunciation',
              '📊 Quiz progress tracking',
              '🔁 Spaced repetition for wrong answers',
              '🔒 Secure Google OAuth login',
              '📱 Mobile & desktop responsive',
            ].map((feature) => (
              <li key={feature} className="text-sm text-gray-600">
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
};

export default InfoPage;
