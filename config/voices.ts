import { Voice } from '../types';

export const VOICES: Voice[] = [
    { id: 'Zephyr', name: 'Zephyr', description: 'Bright, Female (Яркий, Женский)', gender: 'female' },
    { id: 'Puck', name: 'Puck', description: 'Upbeat, Male (Энергичный, Мужской)', gender: 'male' },
    { id: 'Charon', name: 'Charon', description: 'Informative, Male (Информативный, Мужской)', gender: 'male' },
    { id: 'Kore', name: 'Kore', description: 'Firm, Female (Уверенный, Женский)', gender: 'female' },
    { id: 'Fenrir', name: 'Fenrir', description: 'Excitable, Male (Возбужденный, Мужской)', gender: 'male' },
    { id: 'Leda', name: 'Leda', description: 'Youthful, Female (Молодой, Женский)', gender: 'female' },
    { id: 'Orus', name: 'Orus', description: 'Firm, Male (Уверенный, Мужской)', gender: 'male' },
    { id: 'Aoede', name: 'Aoede', description: 'Breezy, Female (Легкий, Женский)', gender: 'female' },
    { id: 'Callirrhoe', name: 'Callirrhoe', description: 'Easy-going, Female (Спокойный, Женский)', gender: 'female' },
    { id: 'Autonoe', name: 'Autonoe', description: 'Bright, Female (Яркий, Женский)', gender: 'female' },
    { id: 'Enceladus', name: 'Enceladus', description: 'Breathy, Male (Дыхательный, Мужской)', gender: 'male' },
    { id: 'Iapetus', name: 'Iapetus', description: 'Clear, Male (Ясный, Мужской)', gender: 'male' },
    { id: 'Umbriel', name: 'Umbriel', description: 'Easy-going, Male (Спокойный, Мужской)', gender: 'male' },
    { id: 'Algieba', name: 'Algieba', description: 'Smooth, Male (Гладкий, Мужской)', gender: 'male' },
    { id: 'Despina', name: 'Despina', description: 'Smooth, Female (Гладкий, Женский)', gender: 'female' },
    { id: 'Erinome', name: 'Erinome', description: 'Clear, Female (Ясный, Женский)', gender: 'female' },
    { id: 'Algenib', name: 'Algenib', description: 'Gravelly, Male (Гортанный, Мужской)', gender: 'male' },
    { id: 'Rasalgethi', name: 'Rasalgethi', description: 'Informative, Male (Информативный, Мужской)', gender: 'male' },
    { id: 'Laomedeia', name: 'Laomedeia', description: 'Upbeat, Female (Энергичный, Женский)', gender: 'female' },
    { id: 'Achernar', name: 'Achernar', description: 'Soft, Female (Мягкий, Женский)', gender: 'female' },
    { id: 'Alnilam', name: 'Alnilam', description: 'Firm, Male (Уверенный, Мужской)', gender: 'male' },
    { id: 'Schedar', name: 'Schedar', description: 'Even, Male (Равномерный, Мужской)', gender: 'male' },
    { id: 'Gacrux', name: 'Gacrux', description: 'Mature, Female (Зрелый, Женский)', gender: 'female' },
    { id: 'Pulcherrima', name: 'Pulcherrima', description: 'Forward, Female (Прямой, Женский)', gender: 'female' },
    { id: 'Achird', name: 'Achird', description: 'Friendly, Male (Дружественный, Мужской)', gender: 'male' },
    { id: 'Zubenelgenubi', name: 'Zubenelgenubi', description: 'Casual, Male (Неформальный, Мужской)', gender: 'male' },
    { id: 'Vindemiatrix', name: 'Vindemiatrix', description: 'Gentle, Female (Мягкий, Женский)', gender: 'female' },
    { id: 'Sadachbia', name: 'Sadachbia', description: 'Lively, Male (Оживленный, Мужской)', gender: 'male' },
    { id: 'Sadaltager', name: 'Sadaltager', description: 'Knowledgeable, Male (Знающий, Мужской)', gender: 'male' },
    { id: 'Sulafat', name: 'Sulafat', description: 'Warm, Female (Теплый, Женский)', gender: 'female' }
];

export const getVoiceListString = (): string => {
    return VOICES.map(v => `- ${v.id} (${v.gender}, ${v.description.split('(')[0].trim()})`).join('\n');
};
