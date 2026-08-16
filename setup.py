from setuptools import setup, find_packages

setup(
    name="calamox",
    version="0.1.0",
    description="Calamox AI — OS-level Jarvis assistant with multi-agent intelligence",
    long_description=open("README.md").read() if __import__("os").path.exists("README.md") else "",
    long_description_content_type="text/markdown",
    author="Calamox Team",
    license="MIT",
    packages=find_packages(),
    include_package_data=True,
    package_data={
        "calamox": [
            "backend/agents_config.json",
            "frontend/dist/**/*",
            "frontend/dist/*",
        ],
    },
    python_requires=">=3.10",
    install_requires=[
        "fastapi>=0.104.0",
        "uvicorn[standard]>=0.24.0",
        "websockets>=12.0",
        "httpx>=0.25.0",
        "beautifulsoup4>=4.12.0",
        "lxml>=4.9.0",
        "pydantic>=2.5.0",
        "pydantic-settings>=2.1.0",
        "python-dotenv>=1.0.0",
        "feedparser>=6.0.0",
    ],
    extras_require={
        "ai": [
            "litellm>=1.15.0",
        ],
        "browser": [
            "playwright>=1.40.0",
        ],
        "voice": [
            "pyttsx3>=2.90",
        ],
        "all": [
            "litellm>=1.15.0",
            "playwright>=1.40.0",
            "pyttsx3>=2.90",
        ],
        "dev": [
            "pytest>=7.4.0",
            "pytest-asyncio>=0.23.0",
            "ruff>=0.1.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "calamox=calamox.cli:main",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Libraries",
    ],
)
