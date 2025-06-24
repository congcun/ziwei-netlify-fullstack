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
        console.log('收到霍兰德测试请求');
        const requestData = JSON.parse(event.body);
        console.log('请求数据:', requestData);

        const { answers, userInfo } = requestData;

        // 验证答案数组
        if (!answers || !Array.isArray(answers) || answers.length !== 24) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: '霍兰德测试需要24道题的完整答案'
                })
            };
        }

        // === 1. 计算霍兰德RIASEC分数 ===
        console.log('开始计算霍兰德分数...');
        
        // 霍兰德测试题目分类（每个维度4道题）
        const questionMapping = {
            R: [0, 1, 2, 3],     // 现实型 (Realistic)
            I: [4, 5, 6, 7],     // 研究型 (Investigative) 
            A: [8, 9, 10, 11],   // 艺术型 (Artistic)
            S: [12, 13, 14, 15], // 社会型 (Social)
            E: [16, 17, 18, 19], // 企业型 (Enterprising)
            C: [20, 21, 22, 23]  // 常规型 (Conventional)
        };

        // 计算各维度分数
        const scores = {};
        for (const [type, indices] of Object.entries(questionMapping)) {
            scores[type] = indices.reduce((sum, index) => sum + (answers[index] || 0), 0);
        }

        // 排序得到类型偏好
        const sortedTypes = Object.entries(scores)
            .sort(([,a], [,b]) => b - a)
            .map(([type, score]) => ({ type, score }));

        // 主要类型（前3位）
        const primaryTypes = sortedTypes.slice(0, 3);
        const hollandCode = primaryTypes.map(t => t.type).join('');

        console.log('霍兰德分数计算完成:', scores);

        // === 2. DeepSeek AI分析 ===
        console.log('开始霍兰德DeepSeek分析...');
        
        const typeDescriptions = {
            R: '现实型 - 喜欢动手操作、使用工具、机械设备',
            I: '研究型 - 喜欢思考、分析、研究复杂问题', 
            A: '艺术型 - 喜欢创作、想象、表达艺术想法',
            S: '社会型 - 喜欢帮助他人、与人交往沟通',
            E: '企业型 - 喜欢领导、组织、追求成就',
            C: '常规型 - 喜欢有序、规范、按规则做事'
        };

        const prompt = `作为专业的职业规划师，请基于以下霍兰德职业兴趣测试结果，为用户提供详细的职业兴趣分析和专业推荐：

【测试结果】
霍兰德代码：${hollandCode}
各维度得分：
${Object.entries(scores).map(([type, score]) => 
    `${type} (${typeDescriptions[type]}): ${score}分`
).join('\n')}

主要类型排序：
${primaryTypes.map((item, index) => 
    `${index + 1}. ${item.type} (${typeDescriptions[item.type]}) - ${item.score}分`
).join('\n')}

${userInfo ? `
【个人信息】
姓名：${userInfo.name || '用户'}
性别：${userInfo.gender || '未知'}
${userInfo.ziweiInfo ? `紫微斗数信息：${JSON.stringify(userInfo.ziweiInfo)}` : ''}
` : ''}

请从以下方面进行分析：

## 1. 职业兴趣特质分析
- 分析主导的职业兴趣类型特征
- 解释各维度分数的含义
- 分析兴趣组合的独特性

## 2. 适合的专业领域
- 基于霍兰德代码推荐5-8个具体专业
- 每个专业要说明匹配的理由
- 按照匹配度排序

## 3. 职业发展路径
- 推荐相关的职业方向
- 分析在这些领域的发展优势
- 提供职业发展建议

## 4. 学习建议
- 提供具体的学习发展建议
- 指出需要培养的核心能力
- 给出实用的行动指导

${userInfo?.ziweiInfo ? '请结合紫微斗数分析结果，提供更个性化的建议。' : ''}

请用通俗易懂的语言，重点关注实用性和可操作性。`;

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
                        temperature: 0.7,
                        max_tokens: 2000
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
                    console.log('霍兰德DeepSeek分析完成');
                } else {
                    console.log('DeepSeek API调用失败，使用默认分析');
                    deepseekAnalysis = generateDefaultHollandAnalysis(scores, primaryTypes, hollandCode);
                }
            } catch (error) {
                console.error('DeepSeek API错误:', error);
                deepseekAnalysis = generateDefaultHollandAnalysis(scores, primaryTypes, hollandCode);
            }
        } else {
            console.log('未配置DeepSeek API Key，使用默认分析');
            deepseekAnalysis = generateDefaultHollandAnalysis(scores, primaryTypes, hollandCode);
        }

        // 返回完整结果
        const result = {
            success: true,
            data: {
                hollandCode,
                scores,
                primaryTypes,
                analysis: deepseekAnalysis,
                analysisTime: new Date().toISOString()
            }
        };

        console.log('霍兰德测试分析完成');
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result)
        };

    } catch (error) {
        console.error('霍兰德测试分析错误:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: `霍兰德测试分析失败: ${error.message}`,
                error: error.toString()
            })
        };
    }
};

// 生成默认霍兰德分析（当DeepSeek API不可用时）
function generateDefaultHollandAnalysis(scores, primaryTypes, hollandCode) {
    const typeInfo = {
        R: { name: '现实型', traits: '动手能力强、注重实际、喜欢机械操作', careers: '工程师、技师、建筑师' },
        I: { name: '研究型', traits: '逻辑思维强、喜欢分析、追求真理', careers: '科研人员、医生、分析师' },
        A: { name: '艺术型', traits: '创造力强、想象丰富、重视美感', careers: '设计师、艺术家、作家' },
        S: { name: '社会型', traits: '人际能力强、喜欢帮助他人、有同理心', careers: '教师、心理咨询师、社工' },
        E: { name: '企业型', traits: '领导能力强、善于组织、追求成就', careers: '管理者、销售员、企业家' },
        C: { name: '常规型', traits: '做事有条理、细心负责、喜欢稳定', careers: '会计师、秘书、图书管理员' }
    };

    const primaryType = primaryTypes[0].type;
    const primaryInfo = typeInfo[primaryType];

    return {
        content: `## 霍兰德职业兴趣测试分析报告

### 您的霍兰德代码：${hollandCode}

### 主要兴趣类型：${primaryInfo.name}
您的主要职业兴趣倾向是${primaryInfo.name}，得分为${primaryTypes[0].score}分。
特征：${primaryInfo.traits}

### 各维度得分分析
${Object.entries(scores).map(([type, score]) => 
    `- ${typeInfo[type].name}(${type})：${score}分`
).join('\n')}

### 推荐专业方向
基于您的兴趣特点，推荐以下专业：
${primaryTypes.slice(0, 3).map(item => 
    `${item.type === primaryType ? '🌟' : '⭐'} ${typeInfo[item.type].careers}相关专业`
).join('\n')}

### 发展建议
1. **发挥优势**：重点发展${primaryInfo.name}相关的技能和知识
2. **平衡发展**：适当培养其他维度的能力，形成复合型优势
3. **实践探索**：通过实习、志愿服务等方式验证职业兴趣
4. **持续学习**：保持对新知识和技能的学习热情

*注：本分析基于霍兰德职业兴趣理论，仅供参考。职业选择还需综合考虑个人能力、价值观和市场需求等因素。*`,
        model: 'default-holland-analysis',
        timestamp: new Date().toISOString()
    };
} 