import React from 'react';
import Spinner from './Spinner';
import { CheckIcon, CloseIcon } from './Icons';

interface LoadingStatus {
    label: string;
    status: 'pending' | 'in_progress' | 'completed' | 'error';
}

interface LoadingScreenProps {
    loadingStatus: LoadingStatus[];
    generationProgress: number;
    warning?: string | null;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ loadingStatus, generationProgress, warning }) => (
    <div className="text-center p-8 w-full max-w-lg">
        <Spinner className="w-16 h-16 mb-6 mx-auto" />
        <h2 className="text-2xl font-bold text-white mb-4">Генерация проекта...</h2>
        
        {warning && (
            <div className="p-4 mb-4 bg-yellow-900/50 border border-yellow-700 rounded-lg text-yellow-200 transition-opacity duration-300">
                {warning}
            </div>
        )}

        <div className="text-left space-y-2 mb-6">
            {loadingStatus.map(step => (
                <div key={step.label} className="flex items-center gap-3 transition-opacity duration-300" style={{ opacity: step.status === 'pending' ? 0.5 : 1 }}>
                    <div className="w-6 h-6 flex-shrink-0">
                        {step.status === 'completed' && <CheckIcon className="w-6 h-6 text-green-400" />}
                        {step.status === 'in_progress' && <Spinner className="w-5 h-5" />}
                        {step.status === 'pending' && <div className="w-5 h-5 rounded-full border-2 border-slate-500"></div>}
                        {step.status === 'error' && <CloseIcon className="w-6 h-6 text-red-400" />}
                    </div>
                    <p className={`text-lg ${step.status === 'in_progress' ? 'text-cyan-300 animate-pulse' : 'text-slate-200'}`}>
                        {step.label}
                    </p>
                </div>
            ))}
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2.5">
            <div 
                className="bg-gradient-to-r from-teal-400 to-cyan-500 h-2.5 rounded-full transition-all duration-500 ease-in-out" 
                style={{ width: `${Math.min(100, Math.max(0, generationProgress))}%` }}
            ></div>
        </div>
        <p className="text-slate-300 text-sm mt-2 font-medium">
            {Math.min(100, Math.max(0, Math.round(generationProgress)))}% завершено
        </p>
    </div>
);

export default LoadingScreen;