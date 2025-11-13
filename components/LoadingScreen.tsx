import React from 'react';
import Spinner from './Spinner';

interface LoadingStatus {
    label: string;
    status: 'pending' | 'in_progress' | 'completed' | 'error';
}

interface LoadingScreenProps {
    loadingStatus: LoadingStatus[];
    generationProgress: number; // Keep for potential future use, but hide from UI
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ loadingStatus }) => {
    const currentStatus = loadingStatus.find(s => s.status === 'in_progress' || s.status === 'error') || loadingStatus[0];

    return (
        <div className="text-center p-8 w-full max-w-lg">
            <Spinner className="w-16 h-16 mb-6 mx-auto" />
            <h2 className="text-2xl font-bold text-white mb-4">Создаем концепцию вашего проекта...</h2>
            {currentStatus && (
                <p className={`text-lg animate-pulse ${currentStatus.status === 'error' ? 'text-red-400' : 'text-cyan-300'}`}>
                    {currentStatus.label}
                </p>
            )}
        </div>
    );
};

export default LoadingScreen;