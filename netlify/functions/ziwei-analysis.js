const iztro = require('iztro');

// DeepSeek API配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-your-deepseek-api-key';
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
        const { name, gender, birthYear, birthMonth, birthDay, birthHour, location } = requestData;
        
        if (!gender || !birthYear || !birthMonth || !birthDay || !birthHour) {
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

        const astrolabe = iztro.astro.astrolabeBySolarDate(`${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`, birthHour, gender === '女' ? 'female' : 'male');
        if (!astrolabe) {
            throw new Error('IZTRO排盘失败');
        }

        // 提取关键信息
        const userInfo = {
            name: name || '用户',
            gender: gender,
            solarDate: astrolabe.solar,
            lunarDate: astrolabe.lunar,
            chineseDate: astrolabe.chineseDate,
            zodiac: astrolabe.zodiac,
            soul: astrolabe.soul,
            body: astrolabe.body,
            fiveElementsClass: astrolabe.fiveElementsClass
        };

        // 宫位信息
        const palaces = astrolabe.palaces.map(palace => ({
            name: palace.name,
            heavenlyStem: palace.heavenlyStem,
            earthlyBranch: palace.earthlyBranch,
            majorStars: palace.majorStars,
            minorStars: palace.minorStars,
            ages: palace.ages,
            isBodyPalace: palace.isBodyPalace,
            isOriginalPalace: palace.isOriginalPalace
        }));

        console.log('IZTRO排盘完成');

        // === 2. DeepSeek AI分析 ===
        console.log('开始DeepSeek AI分析...');
        
        const prompt = `作为一名专业的紫微斗数分析师，请基于以下紫微斗数排盘信息，为用户提供详细的性格特质分析和专业方向建议：

【基本信息】
姓名：${userInfo.name}
性别：${userInfo.gender}
出生日期：${userInfo.solarDate}（${userInfo.lunarDate}）
生辰八字：${userInfo.chineseDate}
生肖：${userInfo.zodiac}
命主：${userInfo.soul}
身主：${userInfo.body}
五行局：${userInfo.fiveElementsClass}

【宫位星曜分布】
${palaces.map(palace => 
    `${palace.name}宫：${palace.heavenlyStem}${palace.earthlyBranch}
    主星：${palace.majorStars.map(star => star.name).join('、') || '无主星'}
    辅星：${palace.minorStars.slice(0, 5).map(star => star.name).join('、')}
    ${palace.isBodyPalace ? '【身宫】' : ''}${palace.isOriginalPalace ? '【命宫】' : ''}`
).join('\n\n')}

请从以下几个方面进行分析：

## 1. 性格特质分析
- 基于命宫主星分析核心性格
- 基于身宫特质分析行为模式
- 基于三方四正分析性格的完整面貌

## 2. 天赋能力分析
- 基于官禄宫分析适合的职业类型
- 基于财帛宫分析财富获取方式
- 基于福德宫分析内在驱动力

## 3. 学习方向建议
- 推荐3-5个最适合的专业领域
- 说明每个专业选择的紫微依据
- 分析在这些领域的发展潜力

## 4. 发展建议
- 提供具体的学习和发展路径
- 指出需要注意的挑战和机遇
- 给出实用的建议

请用专业而易懂的语言，避免过于深奥的术语，重点关注实用性和指导性。`;

        let deepseekAnalysis = null;
        
        if (DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'sk-your-deepseek-api-key') {
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
                        max_tokens: 1000
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
                palaces,
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
                error: error.toString()
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

### 基本信息
您的命宫位于${mingPalace.heavenlyStem}${mingPalace.earthlyBranch}，主星为${majorStars}，五行局为${userInfo.fiveElementsClass}。

### 性格特质
基于您的紫微斗数排盘，您具有以下特质：
- 命主${userInfo.soul}，身主${userInfo.body}，体现了您的核心性格特征
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
