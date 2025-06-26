// 引入所需依赖
const iztro = require('iztro');

// DeepSeek API配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'your-deepseek-api-key-here';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

exports.handler = async (event, context) => {
    // 设置CORS头
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

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
            body: JSON.stringify({ success: false, message: 'Method not allowed' })
        };
    }

    try {
        console.log('收到综合分析请求');
        const requestData = JSON.parse(event.body);
        console.log('请求数据:', requestData);

        const { 
            name, gender, birthYear, birthMonth, birthDay, birthHour, birthMinute = 0, location = '北京',
            hollandAnswers, ziweiAnalysis 
        } = requestData;

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

        console.log('开始综合分析...');

        // === 2. 处理霍兰德测试结果 ===
        const hollandScores = calculateHollandScores(hollandAnswers);
        const hollandResult = analyzeHollandResult(hollandScores);

        // === 3. 如果没有提供紫微分析，则先进行紫微分析 ===
        let ziweiAnalysisData = ziweiAnalysis;
        if (!ziweiAnalysisData) {
            console.log('进行紫微斗数排盘...');
            
            // 生成紫微斗数排盘
            const astrolabe = iztro.astro.astrolabeBySolarDate(
                `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`, 
                birthHour, 
                gender === '女' ? 'female' : 'male'
            );

            // 构建紫微数据
            ziweiAnalysisData = {
                userInfo: {
                    name: name || '用户',
                    gender: gender,
                    solarDate: `${birthYear}-${birthMonth}-${birthDay}`,
                    lunarDate: astrolabe.lunar,
                    chineseDate: astrolabe.chineseDate,
                    zodiac: astrolabe.zodiac,
                    soul: astrolabe.soul,
                    body: astrolabe.body,
                    fiveElementsClass: astrolabe.fiveElementsClass,
                    birthHour: birthHour,
                    location: location
                },
                palaces: astrolabe.palaces,
                horoscope: astrolabe.horoscope
            };

            // 调用DeepSeek进行紫微分析
            const ziweiDeepSeekAnalysis = await callDeepSeekForZiweiAnalysis(ziweiAnalysisData, { name, gender });
            ziweiAnalysisData.deepseekAnalysis = ziweiDeepSeekAnalysis;
        }

        // === 4. 调用DeepSeek进行综合分析 ===
        console.log('开始DeepSeek综合分析...');
        const combinedAnalysis = await callDeepSeekForCombinedAnalysis(
            ziweiAnalysisData, 
            hollandResult, 
            { name, gender, birthYear, birthMonth, birthDay, birthHour, birthMinute, location }
        );

        // === 5. 构建最终响应 ===
        const finalResult = {
            userInfo: ziweiAnalysisData.userInfo,
            ziweiAnalysis: ziweiAnalysisData.deepseekAnalysis,
            hollandResult: hollandResult,
            combinedAnalysis: combinedAnalysis,
            timestamp: new Date().toISOString()
        };

        console.log('综合分析完成');

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
        console.error('综合分析错误:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: '综合分析失败: ' + error.message
            })
        };
    }
};

// === 霍兰德测试相关函数 ===
function calculateHollandScores(answers) {
    // 霍兰德测试题目分类（每个维度4道题）
    const questionMapping = {
        R: [0, 1, 2, 3],     // 现实型 (Realistic)
        I: [4, 5, 6, 7],     // 研究型 (Investigative) 
        A: [8, 9, 10, 11],   // 艺术型 (Artistic)
        S: [12, 13, 14, 15], // 社会型 (Social)
        E: [16, 17, 18, 19], // 企业型 (Enterprising)
        C: [20, 21, 22, 23]  // 常规型 (Conventional)
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

    // 排序得到类型偏好
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
        E: ['领导能力强', '善于组织', '目标导向', '追求成就'],
        C: ['做事有条理', '注重细节', '遵守规则', '稳定可靠']
    };
    return characteristics[type] || [];
}

function getWorkEnvironment(type) {
    const environments = {
        R: '实际操作环境，如工厂、实验室、户外作业',
        I: '研究分析环境，如科研院所、高校、智库',
        A: '创作表达环境，如设计公司、媒体、艺术机构',
        S: '人际服务环境，如学校、医院、社会服务机构',
        E: '商业管理环境，如企业、政府机关、金融机构',
        C: '规范有序环境，如银行、会计事务所、政府部门'
    };
    return environments[type] || '多样化工作环境';
}

function getDevelopmentSuggestion(type) {
    const suggestions = {
        R: '加强专业技能学习，培养精益求精的工匠精神',
        I: '深化专业知识，培养批判性思维和创新能力',
        A: '拓展艺术视野，培养独特的审美和表达能力',
        S: '提升沟通技巧，培养团队协作和服务意识',
        E: '培养战略思维，提升领导力和商业敏感度',
        C: '注重细节管理，培养系统性思维和执行力'
    };
    return suggestions[type] || '全面发展各项能力';
}

function generateMajorRecommendations(primaryType) {
    const recommendations = {
        R: [
            { name: '机械工程', match: 95, reason: '需要动手操作和技术应用' },
            { name: '土木工程', match: 90, reason: '实际建设和工程实施' },
            { name: '电气工程', match: 88, reason: '电气设备操作和维护' },
            { name: '材料科学', match: 85, reason: '材料研发和应用' }
        ],
        I: [
            { name: '计算机科学', match: 95, reason: '逻辑思维和问题解决' },
            { name: '数学与应用数学', match: 92, reason: '抽象思维和理论研究' },
            { name: '物理学', match: 90, reason: '科学研究和理论探索' },
            { name: '生物科学', match: 87, reason: '生命科学研究' }
        ],
        A: [
            { name: '视觉传达设计', match: 95, reason: '创意表达和美学应用' },
            { name: '广告学', match: 90, reason: '创意策划和视觉传达' },
            { name: '建筑学', match: 88, reason: '空间设计和美学创造' },
            { name: '影视制作', match: 85, reason: '艺术创作和技术结合' }
        ],
        S: [
            { name: '教育学', match: 95, reason: '教育他人和社会服务' },
            { name: '心理学', match: 92, reason: '理解和帮助他人' },
            { name: '社会工作', match: 90, reason: '社会服务和人文关怀' },
            { name: '医学', match: 87, reason: '治病救人和健康服务' }
        ],
        E: [
            { name: '工商管理', match: 95, reason: '商业管理和领导能力' },
            { name: '市场营销', match: 92, reason: '商业拓展和市场开发' },
            { name: '金融学', match: 90, reason: '金融投资和风险管理' },
            { name: '国际贸易', match: 87, reason: '商务谈判和国际合作' }
        ],
        C: [
            { name: '会计学', match: 95, reason: '数据处理和规范操作' },
            { name: '法学', match: 90, reason: '规则应用和逻辑分析' },
            { name: '统计学', match: 88, reason: '数据分析和规范处理' },
            { name: '档案学', match: 85, reason: '信息管理和系统整理' }
        ]
    };
    return recommendations[primaryType] || [];
}

// === DeepSeek API调用函数 ===
async function callDeepSeekForZiweiAnalysis(ziweiData, userData) {
    const prompt = buildZiweiAnalysisPrompt(ziweiData.userInfo, ziweiData.palaces, userData);
    
    if (DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'your-deepseek-api-key-here') {
        try {
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
                    max_tokens: 2000
                })
            });

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
            console.error('紫微DeepSeek分析失败:', error);
        }
    }
    
    // 默认分析
    return generateDefaultZiweiAnalysis(ziweiData.userInfo, userData);
}

async function callDeepSeekForCombinedAnalysis(ziweiData, hollandResult, userData) {
    const prompt = buildCombinedAnalysisPrompt(ziweiData, hollandResult, userData);
    
    if (DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'your-deepseek-api-key-here') {
        try {
            console.log('调用DeepSeek API进行综合分析...');
            
            // 设置7秒超时，为Netlify 10秒限制留出余量
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
                    max_tokens: 500  // 减少token数量以加快响应
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                console.log('DeepSeek综合分析完成');
                
                return {
                    type: 'deepseek_api',
                    content: data.choices[0].message.content,
                    model: data.model,
                    timestamp: new Date().toISOString(),
                    usage: data.usage
                };
            }
        } catch (error) {
            console.error('DeepSeek综合分析失败:', error);
        }
    }
    
    // 默认综合分析
    return generateDefaultCombinedAnalysis(ziweiData, hollandResult, userData);
}

// === 提示词构建函数 ===
function buildZiweiAnalysisPrompt(userInfo, palaces, userData) {
    const { name, gender } = userData;
    
    return `请基于以下紫微斗数排盘信息，为${name}（${gender}）提供专业的性格分析和专业选择建议：

【基本信息】
- 生辰八字：${userInfo.chineseDate}

请从以下维度进行分析：
1. **性格特质分析**：基于命宫配置
2. **天赋才能分析**：结合各宫位特点
3. **具体专业推荐**：提供3-5个最适合的大学专业

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

【紫微斗数分析结果】
${ziweiData.deepseekAnalysis?.content || '暂无紫微分析'}

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
