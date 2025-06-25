const iztro = require('iztro');

// DeepSeek API配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
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
        console.log('收到紫微分析请求');
        const requestData = JSON.parse(event.body);
        console.log('请求数据:', requestData);

        // 验证必需参数
        const { name, gender, birthYear, birthMonth, birthDay, birthHour, birthMinute = 0, location } = requestData;
        
        if (!gender || !birthYear || !birthMonth || !birthDay || birthHour === undefined) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: '缺少必需的出生信息参数'
                })
            };
        }

        // === 1. IZTRO紫微斗数排盘 ===
        console.log('开始IZTRO排盘...');
        
        // 修正：使用正确的iztro API调用方式
        const solarDateStr = `${birthYear}-${birthMonth}-${birthDay}`;
        
        // 时辰转换：将小时数转换为时辰索引
        function getTimeIndex(hour, minute = 0) {
            const totalMinutes = hour * 60 + minute;
            
            if (totalMinutes >= 23 * 60 || totalMinutes < 1 * 60) {
                return 0; // 子时 (23:00-1:00)
            } else if (totalMinutes >= 1 * 60 && totalMinutes < 3 * 60) {
                return 1; // 丑时 (1:00-3:00)
            } else if (totalMinutes >= 3 * 60 && totalMinutes < 5 * 60) {
                return 2; // 寅时 (3:00-5:00)
            } else if (totalMinutes >= 5 * 60 && totalMinutes < 7 * 60) {
                return 3; // 卯时 (5:00-7:00)
            } else if (totalMinutes >= 7 * 60 && totalMinutes < 9 * 60) {
                return 4; // 辰时 (7:00-9:00)
            } else if (totalMinutes >= 9 * 60 && totalMinutes < 11 * 60) {
                return 5; // 巳时 (9:00-11:00)
            } else if (totalMinutes >= 11 * 60 && totalMinutes < 13 * 60) {
                return 6; // 午时 (11:00-13:00)
            } else if (totalMinutes >= 13 * 60 && totalMinutes < 15 * 60) {
                return 7; // 未时 (13:00-15:00)
            } else if (totalMinutes >= 15 * 60 && totalMinutes < 17 * 60) {
                return 8; // 申时 (15:00-17:00)
            } else if (totalMinutes >= 17 * 60 && totalMinutes < 19 * 60) {
                return 9; // 酉时 (17:00-19:00)
            } else if (totalMinutes >= 19 * 60 && totalMinutes < 21 * 60) {
                return 10; // 戌时 (19:00-21:00)
            } else {
                return 11; // 亥时 (21:00-23:00)
            }
        }

        const timeIndex = getTimeIndex(birthHour, birthMinute);
        const genderParam = gender === '女' ? 'female' : 'male';
        
        // 使用正确的iztro API调用
        const astrolabe = iztro.astro.bySolar(solarDateStr, timeIndex, genderParam, true, 'zh-CN');
        
        if (!astrolabe) {
            throw new Error('IZTRO排盘失败');
        }

        // 提取关键信息
        const userInfo = {
            name: name || '用户',
            gender: gender,
            solarDate: astrolabe.solarDate,
            lunarDate: astrolabe.lunarDate,
            chineseDate: astrolabe.chineseDate,
            zodiac: astrolabe.zodiac,
            soul: astrolabe.soul,
            body: astrolabe.body,
            fiveElementsClass: astrolabe.fiveElementsClass,
            location: location || '北京'
        };

        // 宫位信息 - 使用正确的数据结构
        const palaces = {};
        const palaceNames = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄', '迁移', '奴仆', '官禄', '田宅', '福德', '父母'];
        
        palaceNames.forEach(palaceName => {
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
            
            palaces[palaceName] = {
                name: palaceName,
                position: palace ? palace.earthlyBranch : '',
                majorStars: majorStars,
                minorStars: minorStars
            };
        });

        console.log('IZTRO排盘完成');

        // === 2. DeepSeek AI分析 ===
        console.log('开始DeepSeek AI分析...');
        
        const prompt = `作为一名专业的紫微斗数分析师，请基于以下紫微斗数排盘信息，为用户提供详细的性格特质分析和专业方向建议：

【基本信息】
性别：${userInfo.gender}
生辰八字：${userInfo.chineseDate}


【宫位星曜分布】
${Object.keys(palaces).map(palaceName => {
    const palace = palaces[palaceName];
    return `${palace.name}宫：${palace.position}
    主星：${palace.majorStars.map(star => star.name).join('、') || '无主星'}
    辅星：${palace.minorStars.slice(0, 5).map(star => star.name).join('、')}`;
}).join('\n\n')}

请从以下几个方面进行分析：

## 1. 性格特质分析
- 基于命宫、迁移宫、财帛宫、官禄公主星综合分析

## 2. 天赋能力分析

## 3. 学习方向建议
- 推荐3-5个最适合的专业领域
- 说明每个专业选择的紫微依据

先讲结论，用简洁、易懂的语言，避免过于冗余、深奥的术语，重点关注实用性和指导性。`;

        let deepseekAnalysis = null;
        
        if (DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'your-deepseek-api-key-here') {
            try {
                const deepseekResponse = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: 'deepseek-chat',
                        messages: [
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        temperature: 0.3,
                        max_tokens: 500
                    })
                });

                if (deepseekResponse.ok) {
                    const deepseekData = await deepseekResponse.json();
                    deepseekAnalysis = {
                        content: deepseekData.choices[0].message.content,
                        model: deepseekData.model,
                        timestamp: new Date().toISOString(),
                        usage: deepseekData.usage
                    };
                    console.log('DeepSeek AI分析完成');
                } else {
                    console.log('DeepSeek API调用失败，使用默认分析');
                    deepseekAnalysis = generateDefaultAnalysis(userInfo, palaces);
                }
            } catch (error) {
                console.error('DeepSeek API错误:', error);
                deepseekAnalysis = generateDefaultAnalysis(userInfo, palaces);
            }
        } else {
            console.log('未配置DeepSeek API Key，使用默认分析');
            deepseekAnalysis = generateDefaultAnalysis(userInfo, palaces);
        }

        // 返回完整结果
        const result = {
            success: true,
            data: {
                userInfo,
                ziweiChart: {
                    palaces
                },
                deepseekAnalysis,
                analysisTime: new Date().toISOString()
            }
        };

        console.log('紫微分析完成');
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result)
        };

    } catch (error) {
        console.error('紫微分析错误:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: `分析失败: ${error.message}`,
                timestamp: new Date().toISOString()
            })
        };
    }
};

// 生成默认分析（当DeepSeek API不可用时）
function generateDefaultAnalysis(userInfo, palaces) {
    const mingPalace = palaces.find(p => p.isOriginalPalace) || palaces[0];
    const majorStars = mingPalace.majorStars.map(s => s.name).join('、') || '无主星';
    
    return {
        content: `## 紫微斗数分析报告

### 性格特质
基于您的紫微斗数排盘，您具有以下特质：
- ${userInfo.fiveElementsClass}的特质影响着您的思维模式和行为方式

### 学习方向建议
根据您的星盘配置，建议考虑以下专业方向：

1. **理工科方向**: 适合逻辑思维强、喜欢解决问题的特质
2. **人文社科**: 适合感性思维、关注人文关怀的特点  
3. **艺术创作**: 发挥创意和想象力的优势
4. **商业管理**: 培养领导能力和组织协调技能

### 发展建议
- 重视基础学科的学习，打好扎实的知识基础
- 培养多元化的兴趣爱好，开拓视野
- 注重实践能力的培养，理论与实践相结合
- 建立良好的人际关系，学会团队合作

*注：本分析基于传统紫微斗数理论，仅供参考。实际发展还需结合个人努力和社会环境因素。*`,
        model: 'default-analysis',
        timestamp: new Date().toISOString()
    };
} 
