// Netlify Functions - 霍兰德综合分析 (稳健版)
// 兼容Node.js 14+ 和 Netlify环境

let astro;
try {
    // 尝试导入iztro
    const iztro = require('iztro');
    astro = iztro.astro;
    console.log('✅ iztro库加载成功');
} catch (error) {
    console.error('❌ iztro库加载失败:', error);
    astro = null;
}

// DeepSeek API配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

// 主处理函数
exports.handler = async (event, context) => {
    // 设置CORS头
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    console.log('🚀 Netlify Function启动');

    // 处理OPTIONS预检请求
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // 只允许POST请求
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Method not allowed' 
            })
        };
    }

    try {
        console.log('📥 解析请求数据...');
        let requestData;
        try {
            requestData = JSON.parse(event.body);
        } catch (parseError) {
            console.error('❌ 请求数据解析失败:', parseError);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: '请求数据格式错误'
                })
            };
        }

        const { 
            name, gender, birthYear, birthMonth, birthDay, birthHour, birthMinute = 0, location = '北京',
            hollandAnswers, ziweiAnalysis 
        } = requestData;

        console.log(`🔮 开始综合分析 - ${name || '用户'}`);

        // === 1. 参数验证 ===
        if (!hollandAnswers || !Array.isArray(hollandAnswers) || hollandAnswers.length !== 24) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: '霍兰德测试答案不完整，需要24道题的答案'
                })
            };
        }

        // === 2. 处理霍兰德测试结果 ===
        console.log('📊 分析霍兰德测试结果...');
        const hollandScores = calculateHollandScores(hollandAnswers);
        const hollandResult = analyzeHollandResult(hollandScores);

        // === 3. 处理紫微分析 ===
        let ziweiAnalysisData = ziweiAnalysis;
        if (!ziweiAnalysisData && astro) {
            console.log('🔮 进行紫微斗数排盘...');
            try {
                ziweiAnalysisData = await generateZiweiAnalysis({
                    name, gender, birthYear, birthMonth, birthDay, birthHour, birthMinute, location
                });
            } catch (ziweiError) {
                console.error('❌ 紫微分析失败:', ziweiError);
                ziweiAnalysisData = generateFallbackZiweiData({ name, gender });
            }
        } else if (!ziweiAnalysisData) {
            console.log('⚠️ iztro不可用，使用基础紫微数据');
            ziweiAnalysisData = generateFallbackZiweiData({ name, gender });
        }

        // === 4. 调用DeepSeek进行综合分析 ===
        console.log('🤖 开始DeepSeek综合分析...');
        let combinedAnalysis;
        try {
            combinedAnalysis = await callDeepSeekForCombinedAnalysis(
                ziweiAnalysisData, 
                hollandResult, 
                { name, gender, birthYear, birthMonth, birthDay, birthHour, birthMinute, location }
            );
        } catch (deepseekError) {
            console.error('❌ DeepSeek分析失败:', deepseekError);
            combinedAnalysis = generateDefaultCombinedAnalysis(ziweiAnalysisData, hollandResult, { name, gender });
        }

        // === 5. 构建最终响应 ===
        const finalResult = {
            userInfo: ziweiAnalysisData.userInfo,
            ziweiAnalysis: ziweiAnalysisData.deepseekAnalysis,
            hollandResult: hollandResult,
            combinedAnalysis: combinedAnalysis,
            timestamp: new Date().toISOString()
        };

        console.log('✅ 综合分析完成');

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: '紫微斗数与霍兰德测试综合分析完成',
                data: finalResult
            })
        };

    } catch (error) {
        console.error('💥 综合分析错误:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: '综合分析失败: ' + (error.message || '未知错误'),
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        };
    }
};

// === 紫微分析函数 ===
async function generateZiweiAnalysis(userData) {
    const { name, gender, birthYear, birthMonth, birthDay, birthHour, birthMinute, location } = userData;
    
    if (!astro) {
        throw new Error('iztro库不可用');
    }

    // 时辰转换函数
    function getTimeIndex(hour, minute = 0) {
        const totalMinutes = hour * 60 + minute;
        if (totalMinutes >= 23 * 60 || totalMinutes < 1 * 60) return 0; // 子时
        else if (totalMinutes >= 1 * 60 && totalMinutes < 3 * 60) return 1; // 丑时
        else if (totalMinutes >= 3 * 60 && totalMinutes < 5 * 60) return 2; // 寅时
        else if (totalMinutes >= 5 * 60 && totalMinutes < 7 * 60) return 3; // 卯时
        else if (totalMinutes >= 7 * 60 && totalMinutes < 9 * 60) return 4; // 辰时
        else if (totalMinutes >= 9 * 60 && totalMinutes < 11 * 60) return 5; // 巳时
        else if (totalMinutes >= 11 * 60 && totalMinutes < 13 * 60) return 6; // 午时
        else if (totalMinutes >= 13 * 60 && totalMinutes < 15 * 60) return 7; // 未时
        else if (totalMinutes >= 15 * 60 && totalMinutes < 17 * 60) return 8; // 申时
        else if (totalMinutes >= 17 * 60 && totalMinutes < 19 * 60) return 9; // 酉时
        else if (totalMinutes >= 19 * 60 && totalMinutes < 21 * 60) return 10; // 戌时
        else return 11; // 亥时
    }
    
    // 生成紫微斗数排盘
    const solarDateStr = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;
    const timeIndex = getTimeIndex(birthHour, birthMinute);
    
    const astrolabe = astro.bySolar(solarDateStr, timeIndex, gender, true, 'zh-CN');

    // 构建紫微数据
    const ziweiAnalysisData = {
        userInfo: {
            name: name || '用户',
            gender: gender,
            solarDate: astrolabe.solarDate,
            lunarDate: astrolabe.lunarDate,
            chineseDate: astrolabe.chineseDate,
            zodiac: astrolabe.zodiac,
            soul: astrolabe.soul,
            body: astrolabe.body,
            fiveElementsClass: astrolabe.fiveElementsClass,
            birthHour: birthHour,
            location: location
        },
        palaces: {}
    };

    // 解析十二宫信息
    const palaceNames = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄', '迁移', '奴仆', '官禄', '田宅', '福德', '父母'];
    
    palaceNames.forEach(palaceName => {
        try {
            const palace = astrolabe.palace(palaceName);
            
            const majorStars = [];
            if (palace && palace.majorStars && Array.isArray(palace.majorStars)) {
                palace.majorStars.forEach(star => {
                    majorStars.push({
                        name: star.name,
                        brightness: star.brightness || '平',
                        mutagen: star.mutagen || null
                    });
                });
            }
            
            const minorStars = [];
            if (palace && palace.minorStars && Array.isArray(palace.minorStars)) {
                palace.minorStars.forEach(star => {
                    minorStars.push({
                        name: star.name,
                        type: star.type,
                        mutagen: star.mutagen || null
                    });
                });
            }
            
            ziweiAnalysisData.palaces[palaceName] = {
                name: palaceName,
                position: palace ? palace.earthlyBranch : '',
                majorStars: majorStars,
                minorStars: minorStars
            };
        } catch (palaceError) {
            console.error(`解析${palaceName}失败:`, palaceError);
            ziweiAnalysisData.palaces[palaceName] = {
                name: palaceName,
                position: '',
                majorStars: [],
                minorStars: []
            };
        }
    });

    // 调用DeepSeek进行紫微分析
    try {
        const ziweiDeepSeekAnalysis = await callDeepSeekForZiweiAnalysis(ziweiAnalysisData, { name, gender });
        ziweiAnalysisData.deepseekAnalysis = ziweiDeepSeekAnalysis;
    } catch (error) {
        console.log('⚠️ 紫微DeepSeek分析失败，使用默认分析');
        ziweiAnalysisData.deepseekAnalysis = generateDefaultZiweiAnalysis(ziweiAnalysisData.userInfo, { name, gender });
    }

    return ziweiAnalysisData;
}

// 生成后备紫微数据
function generateFallbackZiweiData(userData) {
    return {
        userInfo: {
            name: userData.name || '用户',
            gender: userData.gender,
            solarDate: new Date().toISOString().split('T')[0],
            lunarDate: '未知',
            chineseDate: '未知',
            zodiac: '未知',
            soul: '未知',
            body: '未知',
            fiveElementsClass: '未知',
            location: '北京'
        },
        palaces: {},
        deepseekAnalysis: {
            type: 'fallback',
            content: '由于技术原因，紫微斗数排盘暂时不可用。建议您稍后重试或联系技术支持。',
            model: 'fallback',
            timestamp: new Date().toISOString()
        }
    };
}

// === 霍兰德测试相关函数 ===
function calculateHollandScores(answers) {
    const questionMapping = {
        R: [0, 1, 2, 3],     // 现实型
        I: [4, 5, 6, 7],     // 研究型
        A: [8, 9, 10, 11],   // 艺术型
        S: [12, 13, 14, 15], // 社会型
        E: [16, 17, 18, 19], // 企业型
        C: [20, 21, 22, 23]  // 常规型
    };

    const scores = {};
    for (const [type, indices] of Object.entries(questionMapping)) {
        scores[type] = indices.reduce((sum, index) => sum + (answers[index] || 0), 0);
    }

    return scores;
}

function analyzeHollandResult(scores) {
    const typeNames = {
        R: '现实型', I: '研究型', A: '艺术型',
        S: '社会型', E: '企业型', C: '常规型'
    };

    const sortedTypes = Object.entries(scores)
        .sort(([,a], [,b]) => b - a)
        .map(([type, score]) => ({ type, score, name: typeNames[type] }));

    const primaryType = sortedTypes[0].type;
    const hollandCode = sortedTypes.slice(0, 3).map(t => t.type).join('');

    return {
        primaryType: primaryType,
        primaryTypeName: typeNames[primaryType],
        primaryScore: sortedTypes[0].score,
        hollandCode: hollandCode,
        scores: scores,
        sortedTypes: sortedTypes,
        topThreeTypes: sortedTypes.slice(0, 3).map(item => ({
            type: item.type,
            name: item.name,
            score: item.score,
            percentage: Math.round((item.score / 20) * 100)
        })),
        characteristics: getTypeCharacteristics(primaryType),
        workEnvironment: getWorkEnvironment(primaryType),
        developmentSuggestion: getDevelopmentSuggestion(primaryType),
        majorRecommendations: generateMajorRecommendations(primaryType)
    };
}

function getTypeCharacteristics(type) {
    const characteristics = {
        R: ['动手能力强', '喜欢使用工具', '务实稳重', '偏好具体工作'],
        I: ['逻辑思维强', '喜欢研究分析', '独立思考', '追求真理'],
        A: ['创造力强', '想象力丰富', '表达能力好', '追求美感'],
        S: ['人际交往好', '乐于助人', '有同理心', '关注他人需求'],
        E: ['领导能力强', '善于影响他人', '目标导向', '勇于冒险'],
        C: ['组织能力强', '注重细节', '喜欢规则', '追求秩序']
    };
    return characteristics[type] || ['特质分析中'];
}

function getWorkEnvironment(type) {
    const environments = {
        R: '技术性、实用性强的工作环境',
        I: '研究性、学术性的工作环境',
        A: '创意性、自由度高的工作环境',
        S: '社交性、服务性的工作环境',
        E: '竞争性、管理性的工作环境',
        C: '结构化、规范性的工作环境'
    };
    return environments[type] || '多样化工作环境';
}

function getDevelopmentSuggestion(type) {
    const suggestions = {
        R: '发展实际操作技能，关注新技术应用',
        I: '加强理论学习，培养研究方法论',
        A: '发挥创意潜能，培养审美素养',
        S: '提升沟通技巧，发展服务意识',
        E: '培养领导能力，学习商业思维',
        C: '强化组织能力，提高工作效率'
    };
    return suggestions[type] || '全面发展各项能力';
}

function generateMajorRecommendations(primaryType) {
    const recommendations = {
        R: [
            { name: '机械工程', match: 95, reason: '与动手能力和技术思维高度匹配' },
            { name: '土木工程', match: 90, reason: '实用性强，注重实际应用' },
            { name: '电气工程', match: 88, reason: '技术性强，有明确的实用价值' }
        ],
        I: [
            { name: '计算机科学', match: 95, reason: '逻辑思维和研究能力的完美结合' },
            { name: '数学', match: 90, reason: '纯理论研究，符合研究型特质' },
            { name: '物理学', match: 88, reason: '基础科学研究，追求真理' }
        ],
        A: [
            { name: '艺术设计', match: 95, reason: '创造力和美感的直接体现' },
            { name: '广告学', match: 90, reason: '创意表达与商业结合' },
            { name: '建筑学', match: 88, reason: '艺术性与实用性并重' }
        ],
        S: [
            { name: '心理学', match: 95, reason: '帮助他人，深入理解人性' },
            { name: '教育学', match: 90, reason: '服务社会，培养人才' },
            { name: '社会工作', match: 88, reason: '直接服务社会弱势群体' }
        ],
        E: [
            { name: '工商管理', match: 95, reason: '领导能力和商业思维的结合' },
            { name: '市场营销', match: 90, reason: '影响他人，推动商业发展' },
            { name: '国际贸易', match: 88, reason: '全球视野，商业冒险精神' }
        ],
        C: [
            { name: '会计学', match: 95, reason: '规范性强，注重细节和准确性' },
            { name: '法学', match: 90, reason: '规则导向，逻辑严密' },
            { name: '行政管理', match: 88, reason: '组织协调，规范管理' }
        ]
    };
    return recommendations[primaryType] || [];
}

// === DeepSeek API调用函数 ===
async function callDeepSeekForZiweiAnalysis(ziweiData, userData) {
    if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'your-deepseek-api-key-here') {
        return generateDefaultZiweiAnalysis(ziweiData.userInfo, userData);
    }

    const prompt = buildZiweiAnalysisPrompt(ziweiData.userInfo, ziweiData.palaces, userData);
    
    try {
        console.log('🤖 调用DeepSeek API进行紫微分析...');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        
        const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: '你是一位资深的紫微斗数专家，请基于排盘信息提供专业的分析。'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.4,
                max_tokens: 500
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            return {
                type: 'deepseek_api',
                content: data.choices[0].message.content,
                model: data.model,
                timestamp: new Date().toISOString()
            };
        }
    } catch (error) {
        console.error('❌ 紫微DeepSeek分析失败:', error);
    }
    
    return generateDefaultZiweiAnalysis(ziweiData.userInfo, userData);
}

async function callDeepSeekForCombinedAnalysis(ziweiData, hollandResult, userData) {
    if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'your-deepseek-api-key-here') {
        return generateDefaultCombinedAnalysis(ziweiData, hollandResult, userData);
    }

    const prompt = buildCombinedAnalysisPrompt(ziweiData, hollandResult, userData);
    
    try {
        console.log('🤖 调用DeepSeek API进行综合分析...');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        
        const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: '你是一位资深的国学易经术数领域专家，请综合紫微斗数和霍兰德职业兴趣测试结果，为用户提供全面的专业选择建议。'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.4,
                max_tokens: 1500
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            return {
                type: 'deepseek_api',
                content: data.choices[0].message.content,
                model: data.model,
                timestamp: new Date().toISOString(),
                usage: data.usage
            };
        }
    } catch (error) {
        console.error('❌ DeepSeek综合分析失败:', error);
    }
    
    return generateDefaultCombinedAnalysis(ziweiData, hollandResult, userData);
}

// === 提示词构建函数 ===
function buildZiweiAnalysisPrompt(userInfo, palaces, userData) {
    const { name, gender } = userData;
    
    return `请基于以下紫微斗数排盘信息，为${name}（${gender}）提供专业的性格分析和专业选择建议：

请从以下维度进行分析：
1. **性格特质分析**：基于命宫配置
2. **天赋才能分析**：结合各宫位特点
3. **适合的专业领域**：基于星曜特质
4. **具体专业推荐**：提供3-5个最适合的大学专业
5. **学习发展建议**：针对性的能力培养建议

请提供专业、详细的分析报告。`;
}

function buildCombinedAnalysisPrompt(ziweiData, hollandResult, userData) {
    const { name, gender } = userData;
    const { userInfo } = ziweiData;
    
    return `请综合以下紫微斗数和霍兰德职业兴趣测试结果，为${name}（${gender}）提供全面的专业选择建议：

【霍兰德测试结果】
- 主要类型：${hollandResult.primaryTypeName}（${hollandResult.primaryType}型）
- 霍兰德代码：${hollandResult.hollandCode}
- 主要得分：${hollandResult.primaryScore}分
- 类型特征：${hollandResult.characteristics.join('、')}

请提供：
1. **双重验证分析**：紫微斗数与霍兰德测试结果的一致性分析
2. **性格特质综合**：结合两种分析方法的性格特点总结
3. **专业推荐整合**：基于两种分析的专业推荐，并说明匹配度
4. **发展路径建议**：结合传统智慧与现代心理学的发展建议

请提供专业、全面的综合分析报告。`;
}

// === 默认分析函数 ===
function generateDefaultZiweiAnalysis(userInfo, userData) {
    return {
        type: 'default',
        content: `基于${userData.name}的紫微斗数排盘信息：


**性格特质**
根据您的紫微斗数配置，您具有独特的性格特质和天赋潜能。

**专业建议**
建议结合霍兰德职业兴趣测试，获得更全面的专业推荐。

*注：这是基础分析，建议配置DeepSeek API获得更详细的个性化分析。*`,
        model: 'default-analysis',
        timestamp: new Date().toISOString()
    };
}

function generateDefaultCombinedAnalysis(ziweiData, hollandResult, userData) {
    return {
        type: 'default',
        content: `${userData.name}的综合分析报告：

## 双重验证分析
紫微斗数显示您的命主为${ziweiData.userInfo.soul}，身主为${ziweiData.userInfo.body}，五行局为${ziweiData.userInfo.fiveElementsClass}。
霍兰德测试显示您的主要类型为${hollandResult.primaryTypeName}（${hollandResult.hollandCode}），得分${hollandResult.primaryScore}分。

## 性格特质综合
结合两种分析方法，您的主要特征包括：
${hollandResult.characteristics.map(trait => `- ${trait}`).join('\n')}

## 专业推荐整合
基于综合分析，为您推荐以下专业方向：
${hollandResult.majorRecommendations.slice(0, 3).map((major, index) => 
    `${index + 1}. ${major.name}（匹配度：${major.match}%）- ${major.reason}`
).join('\n')}

## 发展建议
${hollandResult.developmentSuggestion}

## 工作环境
适合的工作环境：${hollandResult.workEnvironment}

    };
} 
